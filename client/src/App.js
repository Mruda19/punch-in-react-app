import React, { useState, useEffect } from "react";
import "./App.css";

const API_BASE = "";

export default function App() {
  const [entries, setEntries] = useState([]);
  const [projectCode, setProjectCode] = useState("");
  const [notes, setNotes] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchEntries = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/entries`);
      const data = await res.json();
      setEntries(data);
    } catch (err) {
      console.error("Failed to fetch entries", err);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const totalWorkHours = () => {
    let totalMs = 0;
    let punchInTime = null;

    entries.forEach((e) => {
      if (e.type === "Punch In") {
        punchInTime = new Date(e.time);
      } else if (e.type === "Punch Out" && punchInTime) {
        totalMs += new Date(e.time) - punchInTime;
        punchInTime = null;
      }
    });

    return (totalMs / 3600000).toFixed(2);
  };

  const breaksTaken = entries.filter((e) => e.type === "Start Break").length;

  const handleAction = async (type) => {
    setLoading(true);
    setStatus("");
    try {
      const body = {
        type,
        project: projectCode,
        notes,
        manualDate,
        manualTime,
      };
      const res = await fetch(`${API_BASE}/api/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setStatus(data.message || "Done");
      await fetchEntries();
    } catch (err) {
      setStatus("Error performing action.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-bg">
      <div className="app-container">
        {/* Header */}
        <div className="header">
          <span className="header-emoji">⏰</span>
          <h1 className="header-title">Welcome to Punch Clock</h1>
          <p className="header-subtitle">
            Track your Punch In, Punch Out, Breaks, and Project Work
          </p>
        </div>

        {/* Dashboard Overview */}
        <div className="card">
          <h2 className="card-title">
            <span>📊</span> Dashboard Overview
          </h2>
          <div className="dashboard-stats">
            <div className="stat-row">
              <span className="stat-label">Total Work Hours:</span>
              <span className="stat-value highlight">{totalWorkHours()} hrs</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Breaks Taken:</span>
              <span className="stat-value highlight">{breaksTaken}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Entries Logged:</span>
              <span className="stat-value highlight">{entries.length}</span>
            </div>
          </div>
        </div>

        {/* Add Details */}
        <div className="card">
          <h2 className="card-title">
            <span>📋</span> Add Details
          </h2>
          <div className="form-group">
            <label className="form-label">Project Code:</label>
            <input
              className="form-input"
              type="text"
              placeholder="Enter project code"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes:</label>
            <textarea
              className="form-textarea"
              placeholder="Enter notes here..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Manual Entry */}
        <div className="card">
          <h2 className="card-title">
            <span>🕐</span> Manual Entry
          </h2>
          <div className="manual-entry-row">
            <input
              className="form-input date-input"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
            <input
              className="form-input time-input"
              type="time"
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
            />
          </div>
        </div>

        {/* Action Buttons */}
        {status && <div className="status-msg">{status}</div>}
        <div className="btn-row">
          <button
            className="btn btn-green"
            onClick={() => handleAction("Punch In")}
            disabled={loading}
          >
            Punch In
          </button>
          <button
            className="btn btn-red"
            onClick={() => handleAction("Punch Out")}
            disabled={loading}
          >
            Punch Out
          </button>
          <button
            className="btn btn-teal"
            onClick={() => handleAction("Start Break")}
            disabled={loading}
          >
            Start Break
          </button>
          <button
            className="btn btn-orange"
            onClick={() => handleAction("End Break")}
            disabled={loading}
          >
            End Break
          </button>
        </div>

        {/* Shift History */}
        <div className="card">
          <h2 className="card-title">
            <span>🕐</span> Shift History
          </h2>
          {entries.length === 0 ? (
            <p className="no-entries">No entries yet.</p>
          ) : (
            <div className="table-wrapper">
              <table className="shift-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Time</th>
                    <th>Project</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <tr key={i} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                      <td>
                        <span className={`badge badge-${entry.type.replace(/\s/g, "-").toLowerCase()}`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="time-cell">
                        {new Date(entry.time).toLocaleString()}
                      </td>
                      <td>{entry.project || "-"}</td>
                      <td>{entry.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}