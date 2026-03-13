const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

// Serve React build
app.use(express.static(path.join(__dirname, "client/build")));

const DATA_FILE = path.join(__dirname, "entries.json");

// Load entries from file
function loadEntries() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

// Save entries to file
function saveEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

// GET all entries
app.get("/api/entries", (req, res) => {
  const entries = loadEntries();
  res.json(entries);
});

// POST a new punch action
app.post("/api/punch", (req, res) => {
  const { type, project, notes, manualDate, manualTime } = req.body;

  if (!type) {
    return res.status(400).json({ message: "Action type is required." });
  }

  let timestamp;
  if (manualDate && manualTime) {
    timestamp = new Date(`${manualDate}T${manualTime}`).toISOString();
  } else {
    timestamp = new Date().toISOString();
  }

  const entry = {
    type,
    time: timestamp,
    project: project || null,
    notes: notes || null,
  };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  res.json({ message: `${type} recorded successfully.`, entry });
});

// Fallback to React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/build/index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`server started on port ${PORT}`);
});