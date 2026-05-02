import { useState, useRef, useEffect, useCallback } from "react";
import { exportSession, imageUrl, videoStreamUrl } from "../api";
import VideoPlayer from "./VideoPlayer";

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
    cy: PAD + ny * (H - PAD * 2),  // y_top: 0=back(top), 1=front(bottom) — no inversion needed
  };
}

// Convert canvas pixel coords back to normalized
function fromCanvas(cx, cy, W, H) {
  return {
    nx: (cx - PAD) / (W - PAD * 2),
    ny: (cy - PAD) / (H - PAD * 2),
  };
}

function StageCanvas({ dancers, registry, onDancersChange, addMode }) {
  const canvasRef = useRef(null);
  const draggingRef = useRef(null);
  const dancersRef = useRef(dancers);

  useEffect(() => { dancersRef.current = dancers; }, [dancers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCanvas(canvas, dancers, registry, draggingRef.current?.id);

    // show hint if empty
    if (!dancers?.length) {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#4b5563";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No dancers detected — use + Add Dancer to place manually", canvas.width / 2, canvas.height / 2);
    }
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
      width={720}
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
        cx: PAD + (d.x_top ?? d.x) * (720 - PAD * 2),
        cy: PAD + (d.y_top ?? d.y) * (480 - PAD * 2),
      })),
    }));
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [exporting, setExporting] = useState(false);

  const videoPlayerRef = useRef(null);

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

  // Called by the sync engine inside VideoPlayer when playback crosses a formation timestamp
  function handleFormationChange(idx) {
    if (idx >= 0 && idx < formations.length && idx !== activeIdx) {
      setActiveIdx(idx);
      setAddMode(false);
    }
  }

  // When user clicks a formation button, also seek the video
  function handleFormationClick(idx) {
    setActiveIdx(idx);
    setAddMode(false);
    const ts = formations[idx]?.timestamp ?? 0;
    videoPlayerRef.current?.seekTo(ts);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportSession(session.session_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `formations_${session.session_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{session.metadata.title}</h2>
          <p className="text-sm text-gray-400">
            {formations.length} formation{formations.length !== 1 ? "s" : ""}
            {active ? ` · ${active.dancers?.length ?? 0} dancers` : ""}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm transition"
        >
          {exporting ? "Exporting…" : "⬇ Download PDF"}
        </button>
      </div>

      {/* Formation timeline */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {formations.map((f, i) => (
          <button
            key={f.frame_id}
            onClick={() => handleFormationClick(i)}
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

      {/* Main viewer — side-by-side on desktop, stacked on mobile */}
      {active && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Video Player */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Video Playback
            </p>
            <VideoPlayer
              ref={videoPlayerRef}
              src={videoStreamUrl(session.session_id)}
              formations={formations}
              onFormationChange={handleFormationChange}
              sessionId={session.session_id}
            />
          </div>

          {/* Right: interactive stage canvas */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Formation Map · Top-Down View · {formatTime(active.timestamp ?? 0)}
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
