const express  = require("express");
const path     = require("path");
const fs       = require("fs");
const http     = require("http");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "client/build")));

// ── EC2 backend IP — Render calls EC2 server-to-server (no HTTPS restriction) ──
const EC2_HOST = "10.0.36.162";
const EC2_PORT = 5000;

const DATA_FILE = path.join(__dirname, "entries.json");

function loadEntries() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}

function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

// ── Helper: forward selfie to EC2 → S3 ──────────────────────────
function uploadToEC2(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: EC2_HOST,
      port:     EC2_PORT,
      path:     "/upload-selfie",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success && parsed.s3Url) {
            resolve(parsed.s3Url);
          } else {
            reject(new Error(parsed.error || "EC2 upload returned no URL"));
          }
        } catch {
          reject(new Error("Invalid JSON response from EC2"));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("EC2 request timed out after 15s"));
    });

    req.write(body);
    req.end();
  });
}

// ── GET all entries ──────────────────────────────────────────────
app.get("/api/entries", (req, res) => {
  res.json(loadEntries());
});

// ── POST punch — selfie upload goes Render → EC2 → S3 ───────────
app.post("/api/punch", async (req, res) => {
  const { type, user, manualDate, manualTime, selfie } = req.body;

  if (!type) return res.status(400).json({ message: "Action type is required." });
  if (!user) return res.status(400).json({ message: "User is required." });

  const timestamp = (manualDate && manualTime)
    ? new Date(`${manualDate}T${manualTime}`).toISOString()
    : new Date().toISOString();

  // Upload selfie to S3 via EC2 if image provided
  let finalSelfieUrl = null;

  if (selfie) {
    try {
      console.log(`⬆️  Forwarding selfie to EC2 for ${user} - ${type}`);
      finalSelfieUrl = await uploadToEC2({
        imageBase64: selfie,
        user,
        actionType:  type,
        timestamp,
      });
      console.log("✅ S3 URL received:", finalSelfieUrl);
    } catch (err) {
      console.error("❌ EC2 upload failed:", err.message);
      // Return error to frontend — do NOT silently use base64
      return res.status(502).json({
        message: `Selfie upload to S3 failed: ${err.message}`,
        hint:    "Check EC2 is running and Security Group port 5000 is open",
      });
    }
  }

  // Save punch record with S3 URL
  const entry = {
    type,
    user:   user.trim(),
    time:   timestamp,
    selfie: finalSelfieUrl,   // S3 URL or null
  };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  console.log(`✅ Punch saved: ${type} for ${user} | selfie: ${finalSelfieUrl || "none"}`);
  res.json({ message: `${type} recorded successfully for ${user}.`, entry });
});

// ── DELETE all entries ───────────────────────────────────────────
app.delete("/api/entries", (req, res) => {
  saveEntries([]);
  res.json({ message: "All entries cleared." });
});

// ── Proxy health check to EC2 ────────────────────────────────────
app.get("/api/ec2-health", (req, res) => {
  const options = {
    hostname: EC2_HOST,
    port:     EC2_PORT,
    path:     "/health",
    method:   "GET",
  };
  const probe = http.request(options, (r) => {
    let d = "";
    r.on("data", c => d += c);
    r.on("end", () => res.json({ ec2: "reachable", response: JSON.parse(d) }));
  });
  probe.on("error", (e) => res.json({ ec2: "unreachable", error: e.message }));
  probe.setTimeout(5000, () => { probe.destroy(); res.json({ ec2: "timeout" }); });
  probe.end();
});

// ── Fallback to React app ────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/build/index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`server started on port ${PORT}`);
  console.log(`EC2 backend: ${EC2_HOST}:${EC2_PORT}`);
});