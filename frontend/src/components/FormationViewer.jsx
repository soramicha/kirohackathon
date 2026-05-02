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
      // Always update the registry to ensure we have the latest label
      registry[d.id] = {
        id: d.id,
        color: COLORS[(d.id - 1) % COLORS.length],
        label: d.label,
      };
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

  // Define stage boundaries
  const stageLeft = PAD;
  const stageRight = W - PAD - 180; // Reserve 180px for right offstage
  const stageWidth = stageRight - stageLeft;
  const stageTop = PAD;
  const stageBottom = H - PAD;
  const stageHeight = stageBottom - stageTop;

  // Grid (only in main stage area)
  ctx.strokeStyle = "#1a1d24";
  ctx.lineWidth = 1;
  const gridSize = 60;
  for (let x = stageLeft; x <= stageRight; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, stageTop); ctx.lineTo(x, stageBottom); ctx.stroke();
  }
  for (let y = stageTop; y <= stageBottom; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(stageLeft, y); ctx.lineTo(stageRight, y); ctx.stroke();
  }

  // Main stage border
  ctx.strokeStyle = "#2d3a4a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(stageLeft, stageTop, stageWidth, stageHeight);

  // Left offstage area (if any dancers are there)
  const hasLeftOffstage = dancers.some(d => d.cx < stageLeft);
  if (hasLeftOffstage) {
    const leftOffstageRight = stageLeft - 10;
    const leftOffstageLeft = 10;
    ctx.strokeStyle = "#1a1d24";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(leftOffstageLeft, stageTop, leftOffstageRight - leftOffstageLeft, stageHeight);
    ctx.setLineDash([]);
    
    // Left offstage label
    ctx.fillStyle = "#4b5563";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("OFFSTAGE", (leftOffstageLeft + leftOffstageRight) / 2, stageTop - 8);
  }

  // Right offstage area
  const rightOffstageLeft = stageRight + 10;
  const rightOffstageRight = W - 10;
  ctx.strokeStyle = "#1a1d24";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(rightOffstageLeft, stageTop, rightOffstageRight - rightOffstageLeft, stageHeight);
  ctx.setLineDash([]);

  // Right offstage label
  ctx.fillStyle = "#4b5563";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("OFFSTAGE", (rightOffstageLeft + rightOffstageRight) / 2, stageTop - 8);

  // Corner accents (only on main stage)
  const cLen = 20;
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth = 3;
  ctx.lineCap = "square";
  [[stageLeft, stageTop], [stageRight, stageTop], [stageLeft, stageBottom], [stageRight, stageBottom]].forEach(([cx, cy], i) => {
    const sx = i % 2 === 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(cx, cy + sy * cLen); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * cLen, cy); ctx.stroke();
  });

  // Stage direction labels
  ctx.fillStyle = "#4b5563";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("BACK", stageLeft + stageWidth / 2, stageTop - 8);
  ctx.fillText("FRONT", stageLeft + stageWidth / 2, stageBottom + 18);
  ctx.fillText("L", stageLeft - 14, stageTop + stageHeight / 2 + 4);
  ctx.fillText("R", stageRight + 14, stageTop + stageHeight / 2 + 4);

  // Dancers
  dancers.forEach((d) => {
    const color = registry[d.id]?.color || COLORS[(d.id - 1) % COLORS.length];
    const isDragging = d.id === draggingId;
    const isOffstage = d.offstage || d.cx < stageLeft || d.cx > stageRight;

    // Enhanced glow for transitions
    const grd = ctx.createRadialGradient(d.cx, d.cy, 0, d.cx, d.cy, RADIUS * 2.5);
    let glowOpacity;
    if (isDragging) {
      glowOpacity = isOffstage ? "60" : "90"; // Brighter when dragging
    } else {
      glowOpacity = isOffstage ? "25" : "40";
    }
    grd.addColorStop(0, color + glowOpacity);
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, RADIUS * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Dot with enhanced visual feedback
    if (isOffstage) {
      ctx.fillStyle = color + "70"; // 44% opacity for offstage
      // Add dashed border for offstage dancers
      ctx.setLineDash([3, 3]);
    } else {
      ctx.fillStyle = color;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, isDragging ? RADIUS + 3 : RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Border with enhanced feedback
    let borderOpacity;
    if (isDragging) {
      borderOpacity = isOffstage ? "0.8" : "0.9";
      ctx.strokeStyle = `rgba(255,255,255,${borderOpacity})`;
      ctx.lineWidth = 3;
    } else {
      borderOpacity = isOffstage ? "0.3" : "0.4";
      ctx.strokeStyle = `rgba(255,255,255,${borderOpacity})`;
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Number with enhanced contrast
    ctx.fillStyle = isOffstage ? "#bbb" : "#fff";
    ctx.font = `bold ${isDragging ? 12 : 11}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(d.id), d.cx, d.cy);

    // Name below
    ctx.fillStyle = isOffstage ? "#6b7280" : "#9ca3af";
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "top";
    const dancerLabel = registry[d.id]?.label || `D${d.id}`;
    // Truncate long names to fit under the circle
    const maxWidth = RADIUS * 3;
    let displayName = dancerLabel;
    if (ctx.measureText(displayName).width > maxWidth) {
      // Try to show first name or truncate
      const words = displayName.split(' ');
      if (words.length > 1 && ctx.measureText(words[0]).width <= maxWidth) {
        displayName = words[0];
      } else {
        // Truncate with ellipsis
        while (displayName.length > 1 && ctx.measureText(displayName + '…').width > maxWidth) {
          displayName = displayName.slice(0, -1);
        }
        if (displayName.length < dancerLabel.length) {
          displayName += '…';
        }
      }
    }
    ctx.fillText(displayName, d.cx, d.cy + RADIUS + 4);
  });
}

// Convert normalized coords to canvas pixel coords
function toCanvas(nx, ny, W, H) {
  // Main stage area (bordered grid) - same as original
  const stageLeft = PAD;
  const stageRight = W - PAD - 180; // Reserve 180px on right for offstage
  const stageWidth = stageRight - stageLeft;
  
  // Stage coordinates: 0.0 to 1.0 maps to the main stage area
  // Offstage coordinates: negative values map to left offstage, >1.0 to right offstage
  let cx, cy;
  
  if (nx < 0) {
    // Left offstage area
    cx = stageLeft + nx * stageWidth; // negative nx gives position left of stage
  } else if (nx > 1) {
    // Right offstage area  
    cx = stageRight + (nx - 1) * 180; // beyond 1.0 goes into right offstage area
  } else {
    // Main stage area (0.0 to 1.0)
    cx = stageLeft + nx * stageWidth;
  }
  
  // Y coordinate always uses the main stage height
  cy = PAD + ny * (H - PAD * 2) * 0.75 + (H - PAD * 2) * 0.05;
  
  return { cx, cy };
}

// Convert canvas pixel coords back to normalized
function fromCanvas(cx, cy, W, H) {
  const stageLeft = PAD;
  const stageRight = W - PAD - 180;
  const stageWidth = stageRight - stageLeft;
  
  let nx;
  if (cx < stageLeft) {
    // Left offstage
    nx = (cx - stageLeft) / stageWidth; // will be negative
  } else if (cx > stageRight) {
    // Right offstage
    nx = 1 + (cx - stageRight) / 180; // will be > 1.0
  } else {
    // Main stage
    nx = (cx - stageLeft) / stageWidth;
  }
  
  const ny = ((cy - PAD - (H - PAD * 2) * 0.05) / ((H - PAD * 2) * 0.75));
  
  return { nx, ny };
}

function StageCanvas({ dancers, registry, onDancersChange, addMode, removeMode, onRemoveDancer }) {
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
    
    if (hit && removeMode) {
      // Remove the clicked dancer
      onRemoveDancer(hit.id);
      return;
    }
    
    if (hit && !removeMode) {
      // Start dragging the dancer
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
    
    // Allow movement across the entire canvas (including offstage areas)
    const clamped = {
      cx: Math.max(RADIUS, Math.min(W - RADIUS, cx)),
      cy: Math.max(PAD + RADIUS, Math.min(H - PAD - RADIUS, cy)),
    };
    
    // Update the dancer's normalized coordinates and offstage status
    const { nx, ny } = fromCanvas(clamped.cx, clamped.cy, W, H);
    const stageRight = W - PAD - 180;
    const isNowOffstage = clamped.cx < PAD || clamped.cx > stageRight;
    
    const updated = dancersRef.current.map((d) => {
      if (d.id === draggingRef.current.id) {
        return { 
          ...d, 
          ...clamped, 
          x: nx, 
          y: ny,
          offstage: isNowOffstage,
          // Update label to reflect onstage/offstage status
          label: isNowOffstage 
            ? d.label.replace('(onstage)', '(offstage)').replace(/\([^)]*\)$/, '(offstage)')
            : d.label.replace('(offstage)', '(onstage)').replace(/\([^)]*\)$/, '(onstage)')
        };
      }
      return d;
    });
    
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
      width={780}
      height={480}
      className={`w-full rounded-lg ${
        addMode ? "cursor-crosshair" : 
        removeMode ? "cursor-pointer" : 
        "cursor-grab active:cursor-grabbing"
      }`}
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
    // Pre-compute canvas coords for all dancers using the proper coordinate system
    return initialFormations.map((f) => ({
      ...f,
      dancers: (f.dancers || []).map((d) => {
        const { cx, cy } = toCanvas(d.x_top ?? d.x, d.y_top ?? d.y, 780, 480);
        return {
          ...d,
          cx,
          cy,
        };
      }),
    }));
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingDancer, setEditingDancer] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [lastRemovedDancer, setLastRemovedDancer] = useState(null);

  const videoPlayerRef = useRef(null);

  // Global dancer registry — persists across formations
  const registry = buildRegistry(formations);

  const active = formations[activeIdx];

  function handleDancersChange(newDancers) {
    setFormations((prev) =>
      prev.map((f, i) => i === activeIdx ? { ...f, dancers: newDancers } : f)
    );
  }

  function removeDancer(dancerId) {
    if (!active?.dancers?.length) return;
    const dancerToRemove = active.dancers.find(d => d.id === dancerId);
    if (dancerToRemove) {
      setLastRemovedDancer(dancerToRemove);
      const updatedDancers = active.dancers.filter(d => d.id !== dancerId);
      handleDancersChange(updatedDancers);
      setRemoveMode(false); // Exit remove mode after removing a dancer
    }
  }

  function undoRemove() {
    if (lastRemovedDancer) {
      const updatedDancers = [...active.dancers, lastRemovedDancer];
      handleDancersChange(updatedDancers);
      setLastRemovedDancer(null);
    }
  }

  function toggleAddMode() {
    setAddMode(!addMode);
    setRemoveMode(false); // Exit remove mode when entering add mode
  }

  function toggleRemoveMode() {
    setRemoveMode(!removeMode);
    setAddMode(false); // Exit add mode when entering remove mode
  }

  // Get missing dancers (dancers that exist in registry but not in current formation)
  function getMissingDancers() {
    const currentDancerIds = new Set(active?.dancers?.map(d => d.id) || []);
    return Object.values(registry).filter(d => !currentDancerIds.has(d.id));
  }

  function addBackDancer(dancerId) {
    const dancerFromRegistry = registry[dancerId];
    if (dancerFromRegistry) {
      // Place the dancer in offstage area
      const existingOffstage = active.dancers.filter(d => d.offstage || d.x > 1.0).length;
      const offstage_x = 1.2 + (existingOffstage % 2) * 0.15;
      const offstage_y = 0.1 + (existingOffstage * 0.12);
      
      const { cx, cy } = toCanvas(offstage_x, offstage_y, 780, 480);
      
      const restoredDancer = {
        id: dancerId,
        label: dancerFromRegistry.label,
        x: offstage_x,
        y: offstage_y,
        cx,
        cy,
        bbox: [0, 0, 0, 0],
        keypoints: [],
        confidence: 0.0,
        manual: true,
        offstage: true
      };
      
      const updatedDancers = [...active.dancers, restoredDancer];
      handleDancersChange(updatedDancers);
    }
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

  function startEditingDancer(dancerId, currentLabel) {
    setEditingDancer(dancerId);
    setEditingName(currentLabel);
  }

  function saveDancerName() {
    if (editingDancer && editingName.trim()) {
      // Update the label in all formations for this dancer
      setFormations(prev => 
        prev.map(formation => ({
          ...formation,
          dancers: formation.dancers.map(dancer => 
            dancer.id === editingDancer 
              ? { ...dancer, label: editingName.trim() }
              : dancer
          )
        }))
      );
    }
    setEditingDancer(null);
    setEditingName("");
  }

  function cancelEditingDancer() {
    setEditingDancer(null);
    setEditingName("");
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter') {
      saveDancerName();
    } else if (e.key === 'Escape') {
      cancelEditingDancer();
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
            onClick={() => { setActiveIdx(i); setAddMode(false); setRemoveMode(false); setLastRemovedDancer(null); }}
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
                  onClick={toggleAddMode}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    addMode
                      ? "bg-violet-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {addMode ? "💾 Save" : "+ Add Dancer"}
                </button>
                <button
                  onClick={toggleRemoveMode}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    removeMode
                      ? "bg-red-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {removeMode ? "✕ Cancel" : "− Remove"}
                </button>
                {lastRemovedDancer && (
                  <button
                    onClick={undoRemove}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-yellow-600 text-white hover:bg-yellow-500 transition"
                  >
                    ↶ Undo Remove
                  </button>
                )}
              </div>
            </div>
            {addMode && (
              <div className="space-y-2">
                <p className="text-xs text-violet-400 bg-violet-950 rounded-lg px-3 py-1.5">
                  Click anywhere on the stage to place a new dancer
                </p>
                {getMissingDancers().length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-300 mb-2">
                      Or add back missing dancers:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {getMissingDancers().map((dancer) => (
                        <button
                          key={dancer.id}
                          onClick={() => addBackDancer(dancer.id)}
                          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-lg px-2 py-1 text-xs transition"
                        >
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ background: dancer.color }}
                          >
                            {dancer.id}
                          </span>
                          <span className="text-gray-200">{dancer.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {removeMode && (
              <p className="text-xs text-red-400 bg-red-950 rounded-lg px-3 py-1.5">
                Click on any dancer to remove them
              </p>
            )}
            <div className="rounded-xl overflow-hidden border border-gray-800">
              <StageCanvas
                dancers={active.dancers}
                registry={registry}
                onDancersChange={handleDancersChange}
                addMode={addMode}
                removeMode={removeMode}
                onRemoveDancer={removeDancer}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dancer registry — persistent across all formations */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Dancer Registry — consistent across all formations (click names to edit)
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
              {editingDancer === d.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={saveDancerName}
                  onKeyDown={handleKeyPress}
                  className="text-sm bg-gray-700 text-white rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  autoFocus
                />
              ) : (
                <span 
                  className="text-sm text-gray-300 truncate cursor-pointer hover:text-white transition-colors"
                  onClick={() => startEditingDancer(d.id, d.label)}
                  title="Click to edit name"
                >
                  {d.label}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
