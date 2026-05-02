"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimestampEntry {
  id: number;
  time: string;
  label: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 1;
const uid = () => _id++;

function parseTime(str: string): number | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.some((p) => isNaN(p) || p < 0)) return null;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m > 59 || s > 59) return null;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s > 59) return null;
    return m * 60 + s;
  }
  if (parts.length === 1) return parts[0];
  return null;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com" ||
      u.hostname === "youtu.be"
    );
  } catch {
    return false;
  }
}

function buildYouTubeTimestampUrl(url: string, secs: number): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      u.searchParams.set("t", String(secs));
    } else {
      u.searchParams.set("t", String(secs) + "s");
    }
    return u.toString();
  } catch {
    return url;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimestampRow({
  entry,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  entry: TimestampEntry;
  index: number;
  onChange: (id: number, field: "time" | "label", value: string) => void;
  onRemove: (id: number) => void;
  canRemove: boolean;
}) {
  const isValid = parseTime(entry.time) !== null;
  const hasValue = entry.time.trim() !== "";

  return (
    <div className="flex items-start gap-3 group">
      {/* Row number */}
      <span className="mt-2.5 w-6 text-center text-xs font-mono text-[#00d4ff]/40 select-none">
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Time input */}
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={entry.time}
          onChange={(e) => onChange(entry.id, "time", e.target.value)}
          placeholder="00:00:00"
          maxLength={8}
          className={`
            w-28 bg-black border rounded-lg px-3 py-2 text-sm font-mono text-center
            transition-all duration-200 placeholder:text-gray-700
            ${
              hasValue && !isValid
                ? "border-[#ff6a00] text-[#ff6a00] shadow-[0_0_8px_rgba(255,106,0,0.4)]"
                : "border-[#00d4ff]/30 text-[#00d4ff] focus:border-[#00d4ff] focus:shadow-[0_0_12px_rgba(0,212,255,0.3)]"
            }
          `}
        />
        {hasValue && !isValid && (
          <span className="text-[10px] text-[#ff6a00] text-center">
            invalid
          </span>
        )}
      </div>

      {/* Label input */}
      <input
        type="text"
        value={entry.label}
        onChange={(e) => onChange(entry.id, "label", e.target.value)}
        placeholder="Label (optional)"
        className="
          flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-sm
          text-gray-300 placeholder:text-gray-700
          transition-all duration-200
          focus:border-[#ff6a00]/60 focus:shadow-[0_0_10px_rgba(255,106,0,0.2)]
          focus:text-white
        "
      />

      {/* Remove button */}
      <button
        onClick={() => onRemove(entry.id)}
        disabled={!canRemove}
        title="Remove timestamp"
        className="
          mt-1.5 w-8 h-8 flex items-center justify-center rounded-lg
          border border-white/10 text-gray-600
          transition-all duration-200
          hover:border-[#ff6a00]/60 hover:text-[#ff6a00] hover:shadow-[0_0_8px_rgba(255,106,0,0.3)]
          disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:text-gray-600 disabled:hover:shadow-none
        "
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [url, setUrl] = useState("");
  const [timestamps, setTimestamps] = useState<TimestampEntry[]>([
    { id: uid(), time: "", label: "" },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const isValidUrl = (() => {
    try { new URL(url); return true; } catch { return false; }
  })();
  const isYT = isYouTubeUrl(url);

  const validTimestamps = [...timestamps]
    .filter((t) => parseTime(t.time) !== null)
    .sort((a, b) => (parseTime(a.time) ?? 0) - (parseTime(b.time) ?? 0));

  const canSubmit = url.trim() !== "" && isValidUrl;

  // ── Handlers ──

  const addTimestamp = useCallback(() => {
    setTimestamps((prev) => [...prev, { id: uid(), time: "", label: "" }]);
  }, []);

  const removeTimestamp = useCallback((id: number) => {
    setTimestamps((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateTimestamp = useCallback(
    (id: number, field: "time" | "label", value: string) => {
      setTimestamps((prev) =>
        prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
      );
    },
    []
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setApiError(null);

    try {
      const res = await fetch("/api/timestamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          timestamps: timestamps.map(({ time, label }) => ({ time, label })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setSubmitted(true);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUrl("");
    setTimestamps([{ id: uid(), time: "", label: "" }]);
    setSubmitted(false);
    setApiError(null);
    setCopied(false);
  };

  const buildPlainText = () => {
    const lines = [`🔗 ${url}`, ""];
    validTimestamps.forEach((t) => {
      const secs = parseTime(t.time)!;
      lines.push(t.label ? `${formatTime(secs)} — ${t.label}` : formatTime(secs));
    });
    return lines.join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildPlainText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Render ──

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-start px-4 py-16">

      {/* Header */}
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-black tracking-tight mb-3">
          <span className="text-[#00d4ff] neon-blue">AI</span>
          <span className="text-white">RANGE</span>
          <span className="text-[#ff6a00] neon-orange">US</span>
        </h1>
        <p className="text-gray-500 text-sm tracking-widest uppercase">
          Mark moments. Share links.
        </p>
      </header>

      {/* Card */}
      <div className="card-glow w-full max-w-xl">
        <div className="relative bg-[#050505] rounded-2xl p-8 z-10">

          {!submitted ? (
            <>
              {/* ── URL Input ── */}
              <section className="mb-8">
                <label className="block text-xs font-semibold uppercase tracking-widest text-[#00d4ff]/70 mb-2">
                  YouTube / Video URL
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className={`
                      w-full bg-black rounded-xl px-4 py-3 pr-10 text-sm text-white
                      border transition-all duration-200 placeholder:text-gray-700
                      ${
                        url && !isValidUrl
                          ? "border-[#ff6a00] shadow-[0_0_12px_rgba(255,106,0,0.3)]"
                          : url && isValidUrl
                          ? "border-[#00d4ff]/60 shadow-[0_0_12px_rgba(0,212,255,0.2)]"
                          : "border-white/10 focus:border-[#00d4ff]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)]"
                      }
                    `}
                  />
                  {/* YouTube badge */}
                  {isYT && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#ff6a00] bg-[#ff6a00]/10 border border-[#ff6a00]/30 rounded px-1.5 py-0.5">
                      YT
                    </span>
                  )}
                </div>
                {url && !isValidUrl && (
                  <p className="mt-1.5 text-xs text-[#ff6a00]">Enter a valid URL</p>
                )}
              </section>

              {/* ── Timestamps ── */}
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold uppercase tracking-widest text-[#ff6a00]/70">
                    Timestamps
                  </label>
                  <span className="text-xs font-mono text-gray-600">
                    {validTimestamps.length}/{timestamps.length} valid
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {timestamps.map((entry, i) => (
                    <TimestampRow
                      key={entry.id}
                      entry={entry}
                      index={i}
                      onChange={updateTimestamp}
                      onRemove={removeTimestamp}
                      canRemove={timestamps.length > 1}
                    />
                  ))}
                </div>

                {/* Add button */}
                <button
                  onClick={addTimestamp}
                  className="
                    mt-4 w-full flex items-center justify-center gap-2
                    border border-dashed border-[#00d4ff]/20 rounded-xl py-2.5
                    text-sm text-[#00d4ff]/50 font-medium
                    transition-all duration-200
                    hover:border-[#00d4ff]/60 hover:text-[#00d4ff] hover:shadow-[0_0_12px_rgba(0,212,255,0.15)]
                  "
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Add Timestamp
                </button>
              </section>

              {/* Error */}
              {apiError && (
                <p className="mb-4 text-xs text-[#ff6a00] bg-[#ff6a00]/10 border border-[#ff6a00]/20 rounded-lg px-3 py-2">
                  {apiError}
                </p>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || loading}
                className="
                  w-full py-3 rounded-xl font-bold text-sm tracking-wider uppercase
                  transition-all duration-200
                  bg-[#00d4ff] text-black
                  hover:shadow-[0_0_20px_rgba(0,212,255,0.5)] hover:scale-[1.01]
                  disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:scale-100
                "
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  "Generate"
                )}
              </button>
            </>
          ) : (
            /* ── Result View ── */
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">
                  <span className="text-[#00d4ff] neon-blue">✓</span> Saved
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="
                      text-xs px-3 py-1.5 rounded-lg border font-medium
                      transition-all duration-200
                      border-[#00d4ff]/30 text-[#00d4ff]
                      hover:border-[#00d4ff] hover:shadow-[0_0_8px_rgba(0,212,255,0.3)]
                    "
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                  <button
                    onClick={handleReset}
                    className="
                      text-xs px-3 py-1.5 rounded-lg border font-medium
                      transition-all duration-200
                      border-white/10 text-gray-500
                      hover:border-white/30 hover:text-white
                    "
                  >
                    New
                  </button>
                </div>
              </div>

              {/* URL */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  block mb-6 text-sm text-[#00d4ff] truncate
                  hover:text-[#00d4ff]/80 transition-colors
                "
              >
                {url}
              </a>

              {/* Timestamp list */}
              {validTimestamps.length > 0 ? (
                <ul className="flex flex-col gap-2 mb-6">
                  {validTimestamps.map((t) => {
                    const secs = parseTime(t.time)!;
                    const tsUrl = isYT ? buildYouTubeTimestampUrl(url, secs) : null;
                    return (
                      <li
                        key={t.id}
                        className="
                          flex items-center gap-3 px-4 py-3 rounded-xl
                          bg-white/[0.03] border border-white/[0.06]
                          hover:border-[#ff6a00]/30 transition-all duration-200
                        "
                      >
                        {tsUrl ? (
                          <a
                            href={tsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm text-[#ff6a00] hover:text-[#ff6a00]/80 transition-colors whitespace-nowrap"
                          >
                            {formatTime(secs)}
                          </a>
                        ) : (
                          <span className="font-mono text-sm text-[#ff6a00] whitespace-nowrap">
                            {formatTime(secs)}
                          </span>
                        )}
                        {t.label && (
                          <>
                            <span className="text-white/20">—</span>
                            <span className="text-sm text-gray-300 truncate">{t.label}</span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 italic mb-6">No valid timestamps added.</p>
              )}

              {/* Raw text */}
              <pre className="
                text-xs font-mono text-gray-600 bg-black/60 border border-white/[0.05]
                rounded-xl p-4 whitespace-pre-wrap break-all leading-relaxed
              ">
                {buildPlainText()}
              </pre>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-xs text-gray-700 tracking-widest uppercase">
        Built with Next.js · TypeScript · Tailwind
      </footer>
    </div>
  );
}
