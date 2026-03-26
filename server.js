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

// ── ENV CONFIG ─────────────────────────────────────────────
const LAMBDA_URL    = process.env.LAMBDA_API_URL || "";
const AWS_REGION    = process.env.AWS_REGION     || "ap-south-1";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN  || "";
const AWS_ACCESS    = process.env.AWS_ACCESS_KEY || "";
const AWS_SECRET    = process.env.AWS_SECRET_KEY || "";

const DATA_FILE = path.join(__dirname, "entries.json");

// ── FILE HELPERS ───────────────────────────────────────────
function loadEntries() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}

function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

// ── ✅ FIXED LAMBDA UPLOAD ─────────────────────────────────
function uploadViaLambda(payload) {
  return new Promise((resolve, reject) => {
    if (!LAMBDA_URL) {
      return reject(new Error("LAMBDA_API_URL not configured"));
    }

    const body = JSON.stringify(payload);
    const parsedUrl = new URL(LAMBDA_URL);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", chunk => data += chunk);

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);

          // 🔥 IMPORTANT FIX
          const lambdaData = typeof parsed.body === "string"
            ? JSON.parse(parsed.body)
            : parsed;

          console.log("Lambda response:", lambdaData);

          if (lambdaData.success && lambdaData.imageUrl) {
            resolve(lambdaData.imageUrl);
          } else {
            reject(new Error(lambdaData.error || "Lambda returned no S3 URL"));
          }

        } catch (err) {
          console.error("Lambda parse error:", err);
          reject(new Error("Invalid JSON response from Lambda"));
        }
      });
    });

    req.on("error", reject);

    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("Lambda request timed out"));
    });

    req.write(body);
    req.end();
  });
}

// ── SNS HELPERS ────────────────────────────────────────────
function sign(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function getSignatureKey(secret, date, region, service) {
  return sign(sign(sign(sign("AWS4" + secret, date), region), service), "aws4_request");
}

// ── SEND SNS ───────────────────────────────────────────────
async function sendSNSNotification(user, type, timestamp, s3Url) {
  if (!SNS_TOPIC_ARN || !AWS_ACCESS || !AWS_SECRET) {
    console.warn("⚠️ SNS not configured — skipping");
    return;
  }

  const timeStr = new Date(timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const message = `User: ${user}\nAction: ${type}\nTime: ${timeStr}\nSelfie: ${s3Url || "N/A"}`;

  const bodyStr = new URLSearchParams({
    Action: "Publish",
    TopicArn: SNS_TOPIC_ARN,
    Message: message,
    Version: "2010-03-31",
  }).toString();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "") + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash("sha256").update(bodyStr).digest("hex");

  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:sns.${AWS_REGION}.amazonaws.com\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${AWS_REGION}/sns/aws4_request`;

  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

  const signingKey = getSignatureKey(AWS_SECRET, dateStamp, AWS_REGION, "sns");

  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: `sns.${AWS_REGION}.amazonaws.com`,
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(bodyStr),
        "X-Amz-Date": amzDate,
        "Authorization": authHeader,
      },
    }, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });

    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── ROUTES ─────────────────────────────────────────────────

// GET entries
app.get("/api/entries", (req, res) => {
  res.json(loadEntries());
});

// POST punch
app.post("/api/punch", async (req, res) => {
  const { type, user, manualDate, manualTime, selfie } = req.body;

  if (!type || !user) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const timestamp = (manualDate && manualTime)
    ? new Date(`${manualDate}T${manualTime}`).toISOString()
    : new Date().toISOString();

  let finalSelfieUrl = null;

  if (selfie) {
    try {
      console.log(`Uploading selfie for ${user}`);
      finalSelfieUrl = await uploadViaLambda({
        imageBase64: selfie,
        user,
        actionType: type,
        timestamp,
      });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }

  const entry = { type, user, time: timestamp, selfie: finalSelfieUrl };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  sendSNSNotification(user, type, timestamp, finalSelfieUrl)
    .catch(err => console.error("SNS error:", err));

  res.json({ message: "Punch recorded", entry });
});

// ── SERVE REACT ────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/build/index.html"));
});

// ── START SERVER ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});