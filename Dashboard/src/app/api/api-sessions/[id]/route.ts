import { NextResponse } from "next/server";
import { getApiSessions } from "@/lib/api-session-parser";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // id format: "2026-03-31-0"
  const parts = id.split("-");
  const idx = parseInt(parts.pop()!);
  const date = parts.join("-");

  const sessions = getApiSessions(date);
  const session = sessions[idx];

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}
