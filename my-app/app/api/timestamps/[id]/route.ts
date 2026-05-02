import { NextRequest, NextResponse } from "next/server";
import { get, remove } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = get(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: session });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!remove(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: { message: "Deleted" } });
}
