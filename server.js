const express = require("express");
const path    = require("path");
const fs      = require("fs");

const app = express();

// Selfie images are base64 (~50-100KB each), increase limit
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "client/build")));

const DATA_FILE = path.join(__dirname, "entries.json");

function loadEntries() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}

function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

app.get("/api/entries", (req, res) => {
  res.json(loadEntries());
});

app.post("/api/punch", (req, res) => {
  const { type, user, manualDate, manualTime, selfie } = req.body;
  if (!type) return res.status(400).json({ message: "Action type is required." });
  if (!user) return res.status(400).json({ message: "User is required." });

  const timestamp = (manualDate && manualTime)
    ? new Date(`${manualDate}T${manualTime}`).toISOString()
    : new Date().toISOString();

  const entry = {
    type,
    user: user.trim(),
    time: timestamp,
    selfie: selfie || null,
  };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  res.json({ message: `${type} recorded successfully for ${user}.`, entry });
});

// Clear all entries
app.delete("/api/entries", (req, res) => {
  saveEntries([]);
  res.json({ message: "All entries cleared." });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/build/index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`server started on port ${PORT}`));