import { useState, useRef, useEffect, useCallback } from "react";
import { exportSession, imageUrl, addFormation } from "../api";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const COLORS = [
  "#f97316", "#ec4899", "#14b8a6", "#a855f7", "#3b82f6",
  "#eab308", "#ef4444", "#22c55e", "#06b6d4", "#f43f5e",
  "#84cc16", "#8b5cf6", "#0ea5e9", "#d946ef", "#fb923c",
  "#10b981", "#6366f1", "#e11d48", "#0891b2", "#65a30d",
];

const PAD = 48;
const RADIUS = 18;

// Build a global dancer registry from all formations
function buildRegistry(formations) {
  const registry = {}; // id -> { id, color, label }
  formations.forEach((f) => {
    (f.dancers || []).forEach((d, i) => {
      if (!registry[d.id]) {
        registry[d.id] = {
          id: d.id,
          color: COLORS[(d.id - 1) % COLORS.length],
          label: d.label,
        };
      }
    });
  });
  return registry;
}

function drawCanvas(canvas, dancers, registry, draggingId) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = "#1a1d24";
  ctx.lineWidth = 1;
  const gridSize = 60;
  const bx = PAD, by = PAD, bw = W - PAD * 2, bh = H - PAD * 2;
  for (let x = bx; x <= bx + bw; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, by + bh); ctx.stroke();
  }
  for (let y = by; y <= by + bh; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.stroke();
  }

  // Stage border
  ctx.strokeStyle = "#2d3a4a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, bh);

  // Corner accents
  const cLen = 20;
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth = 3;
  ctx.lineCap = "square";
  [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([cx, cy], i) => {
    const sx = i % 2 === 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(cx, cy + sy * cLen); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * cLen, cy); ctx.stroke();
  });

  // Labels
  ctx.fillStyle = "#4b5563";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("BACK", W / 2, by - 8);
  ctx.fillText("FRONT", W / 2, by + bh + 18);
  ctx.fillText("L", bx - 14, H / 2 + 4);
  ctx.fillText("R", bx + bw + 14, H / 2 + 4);

  // Dancers
  dancers.forEach((d) => {
    const color = registry[d.id]?.color || COLORS[(d.id - 1) % COLORS.length];
    const isDragging = d.id === draggingId;

    // Glow
    const grd = ctx.createRadialGradient(d.cx, d.cy, 0, d.cx, d.cy, RADIUS * 2.5);
    grd.addColorStop(0, color + (isDragging ? "80" : "35"));
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, RADIUS * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, isDragging ? RADIUS + 3 : RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = isDragging ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = isDragging ? 2 : 1.5;
    ctx.stroke();

    // Number
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${isDragging ? 12 : 11}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(d.id), d.cx, d.cy);

    // Name below
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`D${d.id}`, d.cx, d.cy + RADIUS + 4);
  });
}

// Convert normalized coords to canvas pixel coords
function toCanvas(nx, ny, W, H) {
  return {
    cx: PAD + nx * (W - PAD * 2),
    cy: PAD + ny * (H - PAD * 2) * 0.75 + (H - PAD * 2) * 0.05,
  };
}

// Convert canvas pixel coords back to normalized
function fromCanvas(cx, cy, W, H) {
  return {
    nx: (cx - PAD) / (W - PAD * 2),
    ny: ((cy - PAD - (H - PAD * 2) * 0.05) / ((H - PAD * 2) * 0.75)),
  };
}

function StageCanvas({ dancers, registry, onDancersChange, addMode }) {
  const canvasRef = useRef(null);
  const draggingRef = useRef(null);
  const dancersRef = useRef(dancers);

  useEffect(() => { dancersRef.current = dancers; }, [dancers]);

  useEffect(() => {
    drawCanvas(canvasRef.current, dancers, registry, draggingRef.current?.id);
  }, [dancers, registry]);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function hitTest(x, y) {
    return dancersRef.current.find((d) => {
      const dx = d.cx - x, dy = d.cy - y;
      return Math.sqrt(dx * dx + dy * dy) <= RADIUS + 4;
    });
  }

  function handleMouseDown(e) {
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    if (hit) {
      draggingRef.current = { id: hit.id, offsetX: x - hit.cx, offsetY: y - hit.cy };
    } else if (addMode) {
      // Add new dancer at click position
      const W = canvasRef.current.width;
      const H = canvasRef.current.height;
      const { nx, ny } = fromCanvas(x, y, W, H);
      const newId = Math.max(0, ...dancersRef.current.map((d) => d.id)) + 1;
      const { cx, cy } = toCanvas(nx, ny, W, H);
      const newDancer = { id: newId, cx, cy, x: nx, y: ny, x_top: nx, y_top: ny, label: `Dancer ${newId} (manual)`, manual: true };
      onDancersChange([...dancersRef.current, newDancer]);
    }
  }

  function handleMouseMove(e) {
    if (!draggingRef.current) return;
    const { x, y } = getPos(e);
    const W = canvasRef.current.width;
    const H = canvasRef.current.height;
    const cx = x - draggingRef.current.offsetX;
    const cy = y - draggingRef.current.offsetY;
    const clamped = {
      cx: Math.max(PAD + RADIUS, Math.min(W - PAD - RADIUS, cx)),
      cy: Math.max(PAD + RADIUS, Math.min(H - PAD - RADIUS, cy)),
    };
    const updated = dancersRef.current.map((d) =>
      d.id === draggingRef.current.id ? { ...d, ...clamped } : d
    );
    onDancersChange(updated);
    drawCanvas(canvasRef.current, updated, registry, draggingRef.current.id);
  }

  function handleMouseUp() {
    draggingRef.current = null;
    drawCanvas(canvasRef.current, dancersRef.current, registry, null);
  }

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={480}
      className={`w-full rounded-lg ${addMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      style={{ background: "#111318" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}

export default function FormationViewer({ session, formations: initialFormations }) {
  const [formations, setFormations] = useState(() => {
    // Pre-compute canvas coords for all dancers
    return initialFormations.map((f) => ({
      ...f,
      dancers: (f.dancers || []).map((d) => ({
        ...d,
        cx: PAD + (d.x_top ?? d.x) * (600 - PAD * 2),
        cy: PAD + (d.y_top ?? d.y) * (480 - PAD * 2) * 0.75 + (480 - PAD * 2) * 0.05,
      })),
    }));
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showAddFormation, setShowAddFormation] = useState(false);
  const [newTimestamp, setNewTimestamp] = useState("");
  const [addingFormation, setAddingFormation] = useState(false);
  const [addFormationMessage, setAddFormationMessage] = useState(null);

  // Global dancer registry — persists across formations
  const registry = buildRegistry(formations);

  const active = formations[activeIdx];

  function handleDancersChange(newDancers) {
    setFormations((prev) =>
      prev.map((f, i) => i === activeIdx ? { ...f, dancers: newDancers } : f)
    );
  }

  function removeLastDancer() {
    if (!active?.dancers?.length) return;
    handleDancersChange(active.dancers.slice(0, -1));
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportSession(session.session_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `formations_${session.session_id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleAddFormation() {
    // Parse timestamp (supports formats like "1:23" or "83" seconds)
    let timestampSeconds;
    if (newTimestamp.includes(":")) {
      const parts = newTimestamp.split(":");
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseInt(parts[1]) || 0;
      timestampSeconds = minutes * 60 + seconds;
    } else {
      timestampSeconds = parseFloat(newTimestamp);
    }

    if (isNaN(timestampSeconds) || timestampSeconds < 0) {
      setAddFormationMessage({ type: "error", text: "Invalid timestamp format" });
      setTimeout(() => setAddFormationMessage(null), 3000);
      return;
    }

    // Check if timestamp exceeds video duration
    if (session.metadata.duration && timestampSeconds > session.metadata.duration) {
      setAddFormationMessage({ 
        type: "error", 
        text: `Timestamp exceeds video duration (${formatTime(session.metadata.duration)})` 
      });
      setTimeout(() => setAddFormationMessage(null), 3000);
      return;
    }

    setAddingFormation(true);
    try {
      const result = await addFormation(session.session_id, timestampSeconds);
      
      // Convert dancers to canvas coordinates
      const newFormation = {
        frame_id: result.frame_id,
        timestamp: result.timestamp,
        dancers: result.dancers.map((d) => ({
          ...d,
          cx: PAD + (d.x_top ?? d.x) * (600 - PAD * 2),
          cy: PAD + (d.y_top ?? d.y) * (480 - PAD * 2) * 0.75 + (480 - PAD * 2) * 0.05,
        })),
      };

      // Add to formations and sort by timestamp
      setFormations((prev) => {
        const updated = [...prev, newFormation];
        updated.sort((a, b) => a.timestamp - b.timestamp);
        
        // Find and set the index of the newly added formation
        const newIdx = updated.findIndex((f) => f.frame_id === result.frame_id);
        setActiveIdx(newIdx);
        
        return updated;
      });

      setAddFormationMessage({ 
        type: "success", 
        text: `Formation added at ${formatTime(timestampSeconds)} (${result.dancer_count} dancers)` 
      });
      setShowAddFormation(false);
      setNewTimestamp("");
      
      setTimeout(() => setAddFormationMessage(null), 3000);
    } catch (error) {
      console.error("Add formation error:", error);
      setAddFormationMessage({ 
        type: "error", 
        text: error.response?.data?.detail || "Failed to add formation" 
      });
      setTimeout(() => setAddFormationMessage(null), 3000);
    } finally {
      setAddingFormation(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{session.metadata.title}</h2>
          <p className="text-sm text-gray-400">
            {formations.length} formation{formations.length !== 1 ? "s" : ""}
            {active ? ` · ${active.dancers?.length ?? 0} dancers` : ""}
            {session.metadata.duration && ` · ${formatTime(session.metadata.duration)} total`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddFormation(true)}
            className="bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            ➕ Add Formation
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm transition"
          >
            {exporting ? "Exporting…" : "⬇ Download ZIP"}
          </button>
        </div>
      </div>

      {/* Add Formation Modal */}
      {showAddFormation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">Add New Formation</h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter the timestamp where you want to generate a new formation. The system will automatically detect dancers at that moment.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Timestamp
              </label>
              <input
                type="text"
                value={newTimestamp}
                onChange={(e) => setNewTimestamp(e.target.value)}
                placeholder="e.g., 1:23 or 83"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !addingFormation) {
                    handleAddFormation();
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Format: MM:SS or seconds (e.g., "1:23" or "83")
                {session.metadata.duration && ` · Max: ${formatTime(session.metadata.duration)}`}
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddFormation(false);
                  setNewTimestamp("");
                }}
                disabled={addingFormation}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFormation}
                disabled={addingFormation || !newTimestamp.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 transition"
              >
                {addingFormation ? "Generating…" : "Generate Formation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success/Error Message */}
      {addFormationMessage && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 ${
            addFormationMessage.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {addFormationMessage.text}
        </div>
      )}

      {/* Formation timeline */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {formations.map((f, i) => (
          <button
            key={f.frame_id}
            onClick={() => { setActiveIdx(i); setAddMode(false); }}
            className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition ${
              i === activeIdx
                ? "border-violet-500 bg-violet-950 text-white"
                : "border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-600"
            }`}
          >
            <span className="text-xs font-semibold">Formation {i + 1}</span>
            <span className="text-xs font-mono">{formatTime(f.timestamp ?? 0)}</span>
            <span className="text-xs opacity-60">{f.dancers?.length ?? 0} dancers</span>
          </button>
        ))}
      </div>

      {/* Main viewer */}
      {active && (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: original screenshot */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Video Frame · {formatTime(active.timestamp ?? 0)}
            </p>
            <div className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
              <img
                src={imageUrl(session.session_id, `frames/${active.frame_id}.jpg`)}
                alt="Dance frame"
                className="w-full object-cover"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            </div>
          </div>

          {/* Right: interactive stage canvas */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Formation Map · Top-Down View
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAddMode((v) => !v)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    addMode
                      ? "bg-violet-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {addMode ? "✕ Cancel" : "+ Add Dancer"}
                </button>
                <button
                  onClick={removeLastDancer}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 transition"
                >
                  − Remove
                </button>
              </div>
            </div>
            {addMode && (
              <p className="text-xs text-violet-400 bg-violet-950 rounded-lg px-3 py-1.5">
                Click anywhere on the stage to place a dancer
              </p>
            )}
            <div className="rounded-xl overflow-hidden border border-gray-800">
              <StageCanvas
                dancers={active.dancers}
                registry={registry}
                onDancersChange={handleDancersChange}
                addMode={addMode}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dancer registry — persistent across all formations */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Dancer Registry — consistent across all formations
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {Object.values(registry).map((d) => (
            <div key={d.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                style={{ background: d.color }}
              >
                {d.id}
              </span>
              <span className="text-sm text-gray-300 truncate">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
