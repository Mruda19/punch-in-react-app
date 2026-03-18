import React, { useState, useEffect } from "react";
import "./App.css";

const API_BASE = "";

const USERS = [
  "Ajit Jadhav",
  "Kiran Khade",
  "Mruda Sogale",
  "Sandhya Ghuge",
  "Sejal Pawar",
];

const PUNCH_ACTIONS = [
  { label: "Punch In",    type: "Punch In",    icon: "▶", cls: "action-in" },
  { label: "Punch Out",   type: "Punch Out",   icon: "■", cls: "action-out" },
  { label: "Start Break", type: "Start Break", icon: "⏸", cls: "action-break-start" },
  { label: "End Break",   type: "End Break",   icon: "↩", cls: "action-break-end" },
];

export default function App() {
  const [entries, setEntries]       = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [status, setStatus]         = useState({ msg: "", ok: true });
  const [loading, setLoading]       = useState(false);
  const [activeTab, setActiveTab]   = useState("history");
  const [filterUser, setFilterUser] = useState("All Users");
  const [filterType, setFilterType] = useState("All Types");

  const fetchEntries = async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/entries`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch { console.error("Failed to fetch entries"); }
  };

  useEffect(() => { fetchEntries(); }, []);

  const totalWorkHours = () => {
    let ms = 0, pIn = null;
    entries.forEach(e => {
      if (e.type === "Punch In") pIn = new Date(e.time);
      else if (e.type === "Punch Out" && pIn) { ms += new Date(e.time) - pIn; pIn = null; }
    });
    return (ms / 3600000).toFixed(2);
  };

  const todayPunches = entries.filter(e =>
    e.type === "Punch In" && new Date(e.time).toDateString() === new Date().toDateString()
  ).length;

  const breaksTaken = entries.filter(e => e.type === "Start Break").length;

  const statCards = [
    { label: "Total Records",   value: entries.length,          icon: "📁", color: "sc-purple" },
    { label: "Today's Punches", value: todayPunches,            icon: "📅", color: "sc-blue"   },
    { label: "Breaks Taken",    value: breaksTaken,             icon: "☕", color: "sc-amber"  },
    { label: "Total Users",     value: USERS.length,            icon: "👥", color: "sc-teal"   },
    { label: "Work Hours",      value: totalWorkHours() + " h", icon: "⏱️", color: "sc-green"  },
  ];

  const handleAction = async (type) => {
    if (!selectedUser) { setStatus({ msg: "Please select a user first.", ok: false }); return; }
    setLoading(true); setStatus({ msg: "", ok: true });
    try {
      const res  = await fetch(`${API_BASE}/api/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, user: selectedUser, manualDate, manualTime }),
      });
      const data = await res.json();
      setStatus({ msg: data.message || "Recorded!", ok: true });
      await fetchEntries();
    } catch { setStatus({ msg: "Error recording punch.", ok: false }); }
    finally { setLoading(false); }
  };

  const filtered = entries.filter(e =>
    (filterUser === "All Users" || e.user === filterUser) &&
    (filterType === "All Types" || e.type === filterType)
  );

  const dailySummary = () => {
    const map = {};
    entries.forEach(e => {
      const day  = new Date(e.time).toLocaleDateString();
      const user = e.user || "Unknown";
      const key  = `${day}__${user}`;
      if (!map[key]) map[key] = { day, user, pIn: null, pOut: null, breaks: 0, breakMs: 0, bStart: null };
      if (e.type === "Punch In")    map[key].pIn  = new Date(e.time);
      if (e.type === "Punch Out")   map[key].pOut = new Date(e.time);
      if (e.type === "Start Break") { map[key].breaks++; map[key].bStart = new Date(e.time); }
      if (e.type === "End Break" && map[key].bStart) { map[key].breakMs += new Date(e.time) - map[key].bStart; map[key].bStart = null; }
    });
    return Object.values(map).map(r => ({
      ...r,
      duration:  r.pIn && r.pOut ? ((r.pOut - r.pIn) / 3600000).toFixed(2) + " h" : "-",
      breakTime: r.breakMs ? (r.breakMs / 60000).toFixed(0) + " min" : "-",
    }));
  };

  return (
    <div className="app-bg">
      <div className="app-container">

        {/* Header */}
        <header className="header">
          <div className="header-pill">⏰ Punch Clock</div>
          <h1 className="header-title">Welcome to Punch Clock</h1>
          <p className="header-sub">Track your Punch In, Punch Out, Breaks, and Project Work</p>
        </header>

        {/* Stat Cards */}
        <div className="stat-grid">
          {statCards.map((s, i) => (
            <div className={`stat-card ${s.color}`} key={i}>
              <div className="sc-icon">{s.icon}</div>
              <div className="sc-body">
                <div className="sc-value">{s.value}</div>
                <div className="sc-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Record Punch */}
        <div className="card">
          <div className="section-label">RECORD PUNCH</div>

          <div className="select-wrap">
            <select
              className="user-select"
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
            >
              <option value="" disabled>Select employee…</option>
              {USERS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <span className="select-arrow">▾</span>
          </div>

          <label className="manual-toggle">
            <input
              type="checkbox"
              className="toggle-check"
              checked={manualMode}
              onChange={e => setManualMode(e.target.checked)}
            />
            <span className="toggle-box" />
            <span className="toggle-text">
              Enter time manually
              <span className="toggle-hint"> (if auto-detect fails)</span>
            </span>
          </label>

          {manualMode && (
            <div className="manual-row">
              <input className="mini-input" type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
              <input className="mini-input" type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} />
            </div>
          )}

          <div className="action-grid">
            {PUNCH_ACTIONS.map(a => (
              <button
                key={a.type}
                className={`action-btn ${a.cls}`}
                onClick={() => handleAction(a.type)}
                disabled={loading}
              >
                <span className="action-icon">{a.icon}</span>
                <span className="action-label">{a.label}</span>
              </button>
            ))}
          </div>

          {status.msg && (
            <div className={`status-pill ${status.ok ? "status-ok" : "status-err"}`}>
              {status.ok ? "✓" : "✕"} {status.msg}
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="tab-bar">
          <button className={`tab-btn ${activeTab==="history" ? "tab-active":""}`} onClick={() => setActiveTab("history")}>
            📋 Shift History
          </button>
          <button className={`tab-btn ${activeTab==="summary" ? "tab-active":""}`} onClick={() => setActiveTab("summary")}>
            📊 Daily Summary
          </button>
        </div>

        {/* Shift History */}
        {activeTab === "history" && (
          <div className="card">
            <div className="section-label">SHIFT HISTORY</div>
            <div className="filter-row">
              <div className="filter-select-wrap">
                <select className="filter-select" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                  <option>All Users</option>
                  {USERS.map(u => <option key={u}>{u}</option>)}
                </select>
                <span className="select-arrow sm">▾</span>
              </div>
              <div className="filter-select-wrap">
                <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option>All Types</option>
                  {["Punch In","Punch Out","Start Break","End Break"].map(t => <option key={t}>{t}</option>)}
                </select>
                <span className="select-arrow sm">▾</span>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🗂️</span>
                <p>No entries found. Start by recording a punch above.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="shift-table">
                  <thead>
                    <tr><th>#</th><th>USER</th><th>TYPE</th><th>TIME</th><th>DATE</th><th>ACTION</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => (
                      <tr key={i}>
                        <td className="td-num">{i + 1}</td>
                        <td className="td-user">
                          <span className="user-avatar">{(e.user||"?")[0]}</span>
                          {e.user || "-"}
                        </td>
                        <td>
                          <span className={`badge badge-${e.type.replace(/\s/g,"-").toLowerCase()}`}>{e.type}</span>
                        </td>
                        <td className="td-mono">{new Date(e.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</td>
                        <td className="td-mono">{new Date(e.time).toLocaleDateString()}</td>
                        <td><span className="action-dot">•••</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Daily Summary */}
        {activeTab === "summary" && (
          <div className="card">
            <div className="section-label">DAILY SUMMARY</div>
            {dailySummary().length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📊</span>
                <p>No summary data yet.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="shift-table">
                  <thead>
                    <tr><th>#</th><th>USER</th><th>DATE</th><th>SHIFT DURATION</th><th>BREAK</th></tr>
                  </thead>
                  <tbody>
                    {dailySummary().map((r, i) => (
                      <tr key={i}>
                        <td className="td-num">{i + 1}</td>
                        <td className="td-user">
                          <span className="user-avatar">{(r.user||"?")[0]}</span>
                          {r.user}
                        </td>
                        <td className="td-mono">{r.day}</td>
                        <td className="td-mono bold-green">{r.duration}</td>
                        <td className="td-mono">{r.breakTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <footer className="footer">Punch Clock © {new Date().getFullYear()}</footer>
      </div>
    </div>
  );
}