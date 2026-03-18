import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

// ─────────────────────────────────────────────────────────────────
// CONFIG — replace the EC2 URL once your backend is running
// ─────────────────────────────────────────────────────────────────
const API_BASE    = "";                              // Render backend (existing)
// EC2_API → Bastion Host PUBLIC IP (from AWS EC2 console)
// React runs on Render (public internet) so it CANNOT reach
// the private EC2 IP (10.0.x.x) directly.
// Use your Bastion's public IP here, then redeploy to Render.
// EC2 upload is now handled server-side by Render backend (no HTTPS/mixed-content issue)

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

// ─────────────────────────────────────────────────────────────────
// CAMERA MODAL
// ─────────────────────────────────────────────────────────────────
function CameraModal({ user, actionType, onCapture, onCancel }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const [ready,     setReady]     = useState(false);
  const [captured,  setCaptured]  = useState(null);
  const [camErr,    setCamErr]    = useState("");
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setReady(true);
        }
      })
      .catch(() =>
        setCamErr("Camera access denied. Please allow camera permission and try again.")
      );
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const takeSelfie = useCallback(() => {
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width  = video.videoWidth  || 320;
        canvas.height = video.videoHeight || 240;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setCaptured(dataUrl);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      }
    }, 1000);
  }, []);

  const retake = () => {
    setCaptured(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setReady(true);
        }
      });
  };

  const actionColor =
    actionType === "Punch In"    ? "#16a34a" :
    actionType === "Punch Out"   ? "#dc2626" :
    actionType === "Start Break" ? "#d97706" : "#2563eb";

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header" style={{ borderTop: `4px solid ${actionColor}` }}>
          <div className="modal-title">
            <span className="modal-action-badge" style={{ background: actionColor }}>
              {actionType}
            </span>
            <span className="modal-user">👤 {user}</span>
          </div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body">
          {camErr ? (
            <div className="cam-error">
              <span className="cam-error-icon">📷</span>
              <p>{camErr}</p>
              <button className="btn-secondary" onClick={onCancel}>Cancel</button>
            </div>
          ) : (
            <>
              <p className="cam-instruction">
                {captured
                  ? "Does this look good?"
                  : "Position your face in the frame, then click Capture."}
              </p>

              <div className="cam-frame">
                {!captured && (
                  <>
                    <video ref={videoRef} className="cam-video" autoPlay playsInline muted />
                    {countdown !== null && (
                      <div className="cam-countdown">{countdown}</div>
                    )}
                    {!ready && <div className="cam-loading">Starting camera…</div>}
                  </>
                )}
                {captured && (
                  <img src={captured} alt="selfie" className="cam-preview" />
                )}
                <canvas ref={canvasRef} style={{ display: "none" }} />
              </div>

              <div className="modal-actions">
                {!captured ? (
                  <>
                    <button className="btn-secondary" onClick={onCancel}>
                      Cancel
                    </button>
                    <button
                      className="btn-capture"
                      style={{ background: actionColor }}
                      onClick={takeSelfie}
                      disabled={!ready || countdown !== null}
                    >
                      📸 Capture ({actionType})
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-secondary" onClick={retake}>
                      ↩ Retake
                    </button>
                    <button
                      className="btn-capture"
                      style={{ background: actionColor }}
                      onClick={() => onCapture(captured)}
                    >
                      ✓ Confirm &amp; Submit
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SELFIE ZOOM POPUP
// ─────────────────────────────────────────────────────────────────
function SelfiePop({ src, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="selfie-zoom" onClick={e => e.stopPropagation()}>
        <img src={src} alt="selfie" />
        <button className="modal-close selfie-close" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// UPLOAD STATUS MODAL — shows while uploading selfie to S3
// ─────────────────────────────────────────────────────────────────
function UploadingModal({ stage }) {
  const stages = {
    uploading: { icon: "☁️", text: "Uploading selfie to S3…",     color: "#2563eb" },
    saving:    { icon: "💾", text: "Saving punch record…",         color: "#d97706" },
    done:      { icon: "✅", text: "Punch recorded successfully!", color: "#16a34a" },
    error:     { icon: "❌", text: "Upload failed. Please retry.", color: "#dc2626" },
  };
  const s = stages[stage] || stages.uploading;
  return (
    <div className="modal-overlay">
      <div className="upload-modal">
        <div className="upload-icon">{s.icon}</div>
        <p className="upload-text" style={{ color: s.color }}>{s.text}</p>
        {(stage === "uploading" || stage === "saving") && (
          <div className="upload-spinner" />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [entries,      setEntries]      = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [manualMode,   setManualMode]   = useState(false);
  const [manualDate,   setManualDate]   = useState("");
  const [manualTime,   setManualTime]   = useState("");
  const [status,       setStatus]       = useState({ msg: "", ok: true });
  const [loading,      setLoading]      = useState(false);
  const [activeTab,    setActiveTab]    = useState("history");
  const [filterUser,   setFilterUser]   = useState("All Users");
  const [filterType,   setFilterType]   = useState("All Types");

  // Camera & upload state
  const [cameraAction,   setCameraAction]   = useState(null);
  const [zoomSelfie,     setZoomSelfie]     = useState(null);
  const [uploadStage,    setUploadStage]    = useState(null); // null | uploading | saving | done | error

  // ── Fetch entries ──────────────────────────────────────────────
  const fetchEntries = async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/entries`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      console.error("Failed to fetch entries");
    }
  };

  useEffect(() => { fetchEntries(); }, []);

  // ── Stats ──────────────────────────────────────────────────────
  const todayPunches = entries.filter(e =>
    e.type === "Punch In" &&
    new Date(e.time).toDateString() === new Date().toDateString()
  ).length;

  const breaksTaken = entries.filter(e => e.type === "Start Break").length;

  const statCards = [
    { label: "Total Records",   value: entries.length, icon: "📁", color: "sc-purple" },
    { label: "Today's Punches", value: todayPunches,   icon: "📅", color: "sc-blue"   },
    { label: "Breaks Taken",    value: breaksTaken,    icon: "☕", color: "sc-amber"  },
    { label: "Total Users",     value: USERS.length,   icon: "👥", color: "sc-teal"   },
  ];

  // ── Work hours map (per user per day) ─────────────────────────
  const workHoursMap = (() => {
    const map    = {};
    const sorted = [...entries].sort((a, b) => new Date(a.time) - new Date(b.time));
    sorted.forEach(e => {
      const day = new Date(e.time).toLocaleDateString();
      const key = `${e.user}__${day}`;
      if (!map[key]) map[key] = { punchIn: null, punchOut: null };
      if (e.type === "Punch In"  && !map[key].punchIn) map[key].punchIn  = e.time;
      if (e.type === "Punch Out")                       map[key].punchOut = e.time;
    });
    const result = {};
    Object.entries(map).forEach(([key, v]) => {
      const hrs = v.punchIn && v.punchOut
        ? ((new Date(v.punchOut) - new Date(v.punchIn)) / 3600000).toFixed(2) + " h"
        : v.punchIn ? "Active…" : "-";
      result[key] = { punchIn: v.punchIn, punchOut: v.punchOut, hours: hrs };
    });
    return result;
  })();

  const getWorkInfo = (entry) => {
    const day = new Date(entry.time).toLocaleDateString();
    const key = `${entry.user}__${day}`;
    return workHoursMap[key] || { punchIn: null, punchOut: null, hours: "-" };
  };

  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  // ── Step 1: Button click ───────────────────────────────────────
  const handleActionClick = (type) => {
    if (!selectedUser) {
      setStatus({ msg: "Please select a user first.", ok: false });
      return;
    }
    // Punch In / Punch Out → need selfie first
    if (type === "Punch In" || type === "Punch Out") {
      setCameraAction({ type });
    } else {
      // Start Break / End Break → no camera needed
      submitPunch(type, null);
    }
  };

  // ── Step 2: Camera captured → send base64 to Render → EC2 → S3 ─
  // NOTE: We do NOT call EC2 directly from browser (Mixed Content block)
  // Render backend receives base64, forwards to EC2, gets S3 URL, saves to DB
  const onCameraCapture = async (selfieDataUrl) => {
    const type = cameraAction.type;
    setCameraAction(null);

    setUploadStage("uploading");
    setLoading(true);
    setStatus({ msg: "", ok: true });

    try {
      setUploadStage("saving");
      // Pass base64 to submitPunch → Render backend handles EC2 upload internally
      await submitPunch(type, selfieDataUrl);
      setUploadStage("done");
      setTimeout(() => setUploadStage(null), 1500);
    } catch (err) {
      console.error("Punch failed:", err);
      setUploadStage("error");
      setStatus({ msg: err.message || "Something went wrong. Please try again.", ok: false });
      setTimeout(() => setUploadStage(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Save punch record → Render backend forwards selfie to EC2 → S3 ──
  const submitPunch = async (type, selfieBase64OrNull) => {
    try {
      const res = await fetch(`${API_BASE}/api/punch`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          user:       selectedUser,
          manualDate,
          manualTime,
          selfie:     selfieBase64OrNull || null,
        }),
      });

      // Handle error responses from Render (e.g. EC2 unreachable)
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      setStatus({ msg: data.message || "Recorded!", ok: true });
      await fetchEntries();

    } catch {
      setStatus({ msg: "Error saving punch record.", ok: false });
      throw new Error("submitPunch failed");
    }
  };

  // ── Filters ───────────────────────────────────────────────────
  const filtered = entries.filter(e =>
    (filterUser === "All Users" || e.user === filterUser) &&
    (filterType === "All Types" || e.type === filterType)
  );

  // ── Daily Summary ─────────────────────────────────────────────
  const dailySummary = () => {
    const map    = {};
    const sorted = [...entries].sort((a, b) => new Date(a.time) - new Date(b.time));
    sorted.forEach(e => {
      const day  = new Date(e.time).toLocaleDateString();
      const user = e.user || "Unknown";
      const key  = `${day}__${user}`;
      if (!map[key]) map[key] = { day, user, pIn: null, pOut: null, breaks: 0, breakMs: 0, bStart: null };
      if (e.type === "Punch In"   && !map[key].pIn) map[key].pIn  = new Date(e.time);
      if (e.type === "Punch Out")                   map[key].pOut = new Date(e.time);
      if (e.type === "Start Break") { map[key].breaks++; map[key].bStart = new Date(e.time); }
      if (e.type === "End Break" && map[key].bStart) {
        map[key].breakMs += new Date(e.time) - map[key].bStart;
        map[key].bStart = null;
      }
    });
    return Object.values(map).map(r => ({
      ...r,
      punchInStr:  r.pIn  ? r.pIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-",
      punchOutStr: r.pOut ? r.pOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active…",
      duration:    r.pIn && r.pOut
        ? ((r.pOut - r.pIn) / 3600000).toFixed(2) + " h"
        : r.pIn ? "Active…" : "-",
      breakTime:   r.breakMs ? (r.breakMs / 60000).toFixed(0) + " min" : "-",
    }));
  };

  // helper: detect if selfie value is an S3 URL or base64
  const isS3Url = (val) => val && val.startsWith("http");

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="app-bg">

      {/* Camera modal */}
      {cameraAction && (
        <CameraModal
          user={selectedUser}
          actionType={cameraAction.type}
          onCapture={onCameraCapture}
          onCancel={() => setCameraAction(null)}
        />
      )}

      {/* Uploading progress modal */}
      {uploadStage && <UploadingModal stage={uploadStage} />}

      {/* Selfie zoom modal */}
      {zoomSelfie && (
        <SelfiePop src={zoomSelfie} onClose={() => setZoomSelfie(null)} />
      )}

      <div className="app-container">

        {/* ── Header ── */}
        <header className="header">
          <div className="header-pill">⏰ Punch Clock</div>
          <h1 className="header-title">Welcome to Punch Clock</h1>
          <p className="header-sub">
            Track your Punch In, Punch Out, Breaks, and Project Work
          </p>
        </header>

        {/* ── Stat Cards ── */}
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

        {/* ── Record Punch ── */}
        <div className="card">
          <div className="section-label">RECORD PUNCH</div>

          {/* User dropdown */}
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

          {/* Manual time toggle */}
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
              <input
                className="mini-input"
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
              />
              <input
                className="mini-input"
                type="time"
                value={manualTime}
                onChange={e => setManualTime(e.target.value)}
              />
            </div>
          )}

          {/* Camera notice */}
          <div className="cam-notice">
            <span>📷</span> Punch In &amp; Punch Out require a selfie — photo uploads to S3
          </div>

          {/* Action buttons */}
          <div className="action-grid">
            {PUNCH_ACTIONS.map(a => (
              <button
                key={a.type}
                className={`action-btn ${a.cls}`}
                onClick={() => handleActionClick(a.type)}
                disabled={loading}
              >
                <span className="action-icon">{a.icon}</span>
                <span className="action-label">{a.label}</span>
                {(a.type === "Punch In" || a.type === "Punch Out") && (
                  <span className="cam-badge">📷</span>
                )}
              </button>
            ))}
          </div>

          {/* Status message */}
          {status.msg && (
            <div className={`status-pill ${status.ok ? "status-ok" : "status-err"}`}>
              {status.ok ? "✓" : "✕"} {status.msg}
            </div>
          )}
        </div>

        {/* ── Tab Bar ── */}
        <div className="tab-bar">
          <button
            className={`tab-btn ${activeTab === "history" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            📋 Shift History
          </button>
          <button
            className={`tab-btn ${activeTab === "summary" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("summary")}
          >
            📊 Daily Summary
          </button>
        </div>

        {/* ── Shift History ── */}
        {activeTab === "history" && (
          <div className="card">
            <div className="section-label">SHIFT HISTORY</div>

            {/* Filters */}
            <div className="filter-row">
              <div className="filter-select-wrap">
                <select
                  className="filter-select"
                  value={filterUser}
                  onChange={e => setFilterUser(e.target.value)}
                >
                  <option>All Users</option>
                  {USERS.map(u => <option key={u}>{u}</option>)}
                </select>
                <span className="select-arrow sm">▾</span>
              </div>
              <div className="filter-select-wrap">
                <select
                  className="filter-select"
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                >
                  <option>All Types</option>
                  {["Punch In", "Punch Out", "Start Break", "End Break"].map(t => (
                    <option key={t}>{t}</option>
                  ))}
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
                    <tr>
                      <th>#</th>
                      <th>USER</th>
                      <th>TYPE</th>
                      <th>PUNCH IN</th>
                      <th>PUNCH OUT</th>
                      <th>WORK HRS</th>
                      <th>DATE</th>
                      <th>SELFIE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => {
                      const wi = getWorkInfo(e);
                      return (
                        <tr key={i}>
                          <td className="td-num">{i + 1}</td>

                          {/* User */}
                          <td>
                            <div className="td-user">
                              <span className="user-avatar">
                                {e.user ? e.user[0].toUpperCase() : "?"}
                              </span>
                              <span>{e.user || <span className="no-user">Unknown</span>}</span>
                            </div>
                          </td>

                          {/* Type badge */}
                          <td>
                            <span className={`badge badge-${e.type.replace(/\s/g, "-").toLowerCase()}`}>
                              {e.type}
                            </span>
                          </td>

                          {/* Punch In time */}
                          <td className="td-mono time-green">
                            {wi.punchIn ? fmt(wi.punchIn) : <span className="td-dash">—</span>}
                          </td>

                          {/* Punch Out time */}
                          <td className="td-mono time-red">
                            {wi.punchOut ? fmt(wi.punchOut) : <span className="td-dash">—</span>}
                          </td>

                          {/* Work hours */}
                          <td className="td-mono bold-green">{wi.hours}</td>

                          {/* Date */}
                          <td className="td-mono">
                            {new Date(e.time).toLocaleDateString()}
                          </td>

                          {/* Selfie — shows thumbnail + S3/local badge */}
                          <td>
                            {e.selfie ? (
                              <div className="selfie-cell">
                                <img
                                  src={e.selfie}
                                  alt="selfie"
                                  className="selfie-thumb"
                                  onClick={() => setZoomSelfie(e.selfie)}
                                />
                                <span className={`selfie-badge ${isS3Url(e.selfie) ? "badge-s3" : "badge-local"}`}>
                                  {isS3Url(e.selfie) ? "S3" : "local"}
                                </span>
                              </div>
                            ) : (
                              <span className="td-dash">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Daily Summary ── */}
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
                    <tr>
                      <th>#</th>
                      <th>USER</th>
                      <th>DATE</th>
                      <th>PUNCH IN</th>
                      <th>PUNCH OUT</th>
                      <th>WORK HRS</th>
                      <th>BREAK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySummary().map((r, i) => (
                      <tr key={i}>
                        <td className="td-num">{i + 1}</td>
                        <td>
                          <div className="td-user">
                            <span className="user-avatar">
                              {r.user ? r.user[0].toUpperCase() : "?"}
                            </span>
                            <span>{r.user || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="td-mono">{r.day}</td>
                        <td className="td-mono time-green">{r.punchInStr}</td>
                        <td className="td-mono time-red">{r.punchOutStr}</td>
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