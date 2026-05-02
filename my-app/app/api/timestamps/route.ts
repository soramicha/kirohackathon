import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAll, save } from "@/lib/store";
import { persistSession } from "@/lib/persist";
import { TimestampSession } from "@/types";

function parseTime(str: string): number | null {
  const parts = str.trim().split(":").map(Number);
  if (parts.some((p) => isNaN(p) || p < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

export async function GET() {
  return NextResponse.json({ data: getAll() });
}

export async function POST(req: NextRequest) {
  let body: { url: string; timestamps: { time: string; label: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, timestamps } = body;

  if (!url?.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  try { new URL(url); } catch {
    return NextResponse.json({ error: "url is not valid" }, { status: 400 });
  }

  const validTimestamps = (timestamps ?? []).filter(
    (t) => t.time?.trim() && parseTime(t.time) !== null
  );

  const session: TimestampSession = {
    id: randomUUID(),
    url: url.trim(),
    timestamps: validTimestamps.map((t) => ({
      id: randomUUID(),
      time: t.time.trim(),
      label: (t.label ?? "").trim(),
    })),
    createdAt: new Date().toISOString(),
  };

  save(session);

  // Persist to outputs/<id>/metadata.json
  const savedPath = persistSession(session);
  console.log(`[timestamps] session saved to ${savedPath}`);

  return NextResponse.json({ data: session }, { status: 201 });
}
