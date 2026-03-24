require("dotenv").config();

const express  = require("express");
const path     = require("path");
const fs       = require("fs");
const https    = require("https");
const crypto   = require("crypto");
const { URL }  = require("url");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "client/build")));

// ── Config — set these in Render Dashboard → Environment ─────────
// LAMBDA_API_URL = https://xxxxxx.execute-api.ap-south-1.amazonaws.com/prod/upload-selfie
// SNS_TOPIC_ARN  = arn:aws:sns:ap-south-1:XXXXXXXXXXXX:punch-notifications
// AWS_REGION     = ap-south-1
// AWS_ACCESS_KEY = your IAM access key
// AWS_SECRET_KEY = your IAM secret key
const LAMBDA_URL    = process.env.LAMBDA_API_URL || "";
const AWS_REGION    = process.env.AWS_REGION     || "ap-south-1";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN  || "";
const AWS_ACCESS    = process.env.AWS_ACCESS_KEY  || "";
const AWS_SECRET    = process.env.AWS_SECRET_KEY  || "";

const DATA_FILE = path.join(__dirname, "entries.json");

function loadEntries() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}
function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

// ── Upload selfie via API Gateway → Lambda → S3 ──────────────────
function uploadViaLambda(payload) {
  return new Promise((resolve, reject) => {
    if (!LAMBDA_URL) return reject(new Error("LAMBDA_API_URL not configured in environment variables"));

    const body       = JSON.stringify(payload);
    const parsedUrl  = new URL(LAMBDA_URL);

    const options = {
      hostname: parsedUrl.hostname,
      path:     parsedUrl.pathname + parsedUrl.search,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success && parsed.s3Url) resolve(parsed.s3Url);
          else reject(new Error(parsed.error || "Lambda returned no S3 URL"));
        } catch {
          reject(new Error("Invalid JSON response from Lambda"));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("Lambda request timed out after 20s"));
    });

    req.write(body);
    req.end();
  });
}

// ── AWS Signature v4 helper (for SNS) ────────────────────────────
function sign(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}
function getSignatureKey(secret, date, region, service) {
  return sign(sign(sign(sign("AWS4" + secret, date), region), service), "aws4_request");
}

// ── Send SNS notification ─────────────────────────────────────────
async function sendSNSNotification(user, type, timestamp, s3Url) {
  if (!SNS_TOPIC_ARN || !AWS_ACCESS || !AWS_SECRET) {
    console.warn("⚠️  SNS not configured — skipping notification");
    return;
  }

  const timeStr = new Date(timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const icon    = type === "Punch In"    ? "🟢" :
                  type === "Punch Out"   ? "🔴" :
                  type === "Start Break" ? "🟡" : "🔵";

  const message = [
    `${icon} PUNCH CLOCK ALERT`,
    `─────────────────────`,
    `Employee : ${user}`,
    `Action   : ${type}`,
    `Time     : ${timeStr} (IST)`,
    s3Url ? `Selfie   : ${s3Url}` : `Selfie   : Not captured`,
    `─────────────────────`,
    `Punch Clock App`,
  ].join("\n");

  const subject   = `${icon} ${user} — ${type} at ${timeStr}`;
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const bodyStr   = new URLSearchParams({
    Action: "Publish", TopicArn: SNS_TOPIC_ARN,
    Message: message, Subject: subject, Version: "2010-03-31",
  }).toString();

  const payloadHash      = crypto.createHash("sha256").update(bodyStr).digest("hex");
  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:sns.${AWS_REGION}.amazonaws.com\nx-amz-date:${amzDate}\n`;
  const signedHeaders    = "content-type;host;x-amz-date";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credScope        = `${dateStamp}/${AWS_REGION}/sns/aws4_request`;
  const strToSign        = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n` +
    crypto.createHash("sha256").update(canonicalRequest).digest("hex");
  const signature        = crypto.createHmac("sha256",
    getSignatureKey(AWS_SECRET, dateStamp, AWS_REGION, "sns"))
    .update(strToSign).digest("hex");
  const authHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: `sns.${AWS_REGION}.amazonaws.com`,
      path: "/", method: "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(bodyStr),
        "X-Amz-Date":     amzDate,
        "Authorization":  authHeader,
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode === 200) { console.log("✅ SNS sent:", subject); resolve(); }
        else { console.error("❌ SNS error:", res.statusCode, data); reject(new Error(`SNS HTTP ${res.statusCode}`)); }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── GET all entries ──────────────────────────────────────────────
app.get("/api/entries", (req, res) => res.json(loadEntries()));

// ── POST punch ───────────────────────────────────────────────────
app.post("/api/punch", async (req, res) => {
  const { type, user, manualDate, manualTime, selfie } = req.body;

  if (!type) return res.status(400).json({ message: "Action type is required." });
  if (!user) return res.status(400).json({ message: "User is required." });

  const timestamp = (manualDate && manualTime)
    ? new Date(`${manualDate}T${manualTime}`).toISOString()
    : new Date().toISOString();

  // Step 1 — Upload selfie via Lambda → S3
  let finalSelfieUrl = null;
  if (selfie) {
    try {
      console.log(`⬆️  Sending selfie to Lambda for ${user} - ${type}`);
      finalSelfieUrl = await uploadViaLambda({
        imageBase64: selfie,
        user,
        actionType: type,
        timestamp,
      });
      console.log("✅ S3 URL:", finalSelfieUrl);
    } catch (err) {
      console.error("❌ Lambda upload failed:", err.message);
      return res.status(502).json({
        message: `Selfie upload failed: ${err.message}`,
        hint: "Check LAMBDA_API_URL is set correctly in Render environment variables",
      });
    }
  }

  // Step 2 — Save punch entry
  const entry = { type, user: user.trim(), time: timestamp, selfie: finalSelfieUrl };
  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);
  console.log(`✅ Punch saved: ${type} for ${user} | selfie: ${finalSelfieUrl || "none"}`);

  // Step 3 — SNS notification (non-blocking)
  sendSNSNotification(user, type, timestamp, finalSelfieUrl)
    .catch(err => console.error("⚠️  SNS failed:", err.message));

  res.json({ message: `${type} recorded successfully for ${user}.`, entry });
});

// ── DELETE all entries ───────────────────────────────────────────
app.delete("/api/entries", (req, res) => {
  saveEntries([]);
  res.json({ message: "All entries cleared." });
});

// ── Lambda health check ──────────────────────────────────────────
app.get("/api/lambda-health", (req, res) => {
  if (!LAMBDA_URL) return res.json({ status: "not configured", hint: "Set LAMBDA_API_URL in Render environment" });
  const parsedUrl = new URL(LAMBDA_URL);
  res.json({
    status:   "configured",
    endpoint: parsedUrl.hostname,
    path:     parsedUrl.pathname,
    sns:      SNS_TOPIC_ARN ? "configured" : "not configured",
  });
});

// ── Fallback to React ────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/build/index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`server started on port ${PORT}`);
  console.log(`Lambda URL : ${LAMBDA_URL || "NOT CONFIGURED"}`);
  console.log(`SNS topic  : ${SNS_TOPIC_ARN || "NOT CONFIGURED"}`);
});