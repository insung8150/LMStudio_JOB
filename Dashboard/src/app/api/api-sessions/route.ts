import { NextResponse } from "next/server";
import {
  getApiSessions,
  getAvailableSessionDates,
} from "@/lib/api-session-parser";
import { startCollector } from "@/lib/api-log-collector";

export const dynamic = "force-dynamic";

startCollector();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || undefined;

  const sessions = getApiSessions(date);
  const dates = getAvailableSessionDates();

  // turns는 목록에서 제외 (상세 조회 시만)
  const summaries = sessions.map(({ turns, ...rest }) => ({
    ...rest,
    turnPreview: turns
      .filter((t) => t.role === "user")
      .map((t) => t.content.slice(0, 100))
      .pop() || "",
  }));

  return NextResponse.json({ sessions: summaries, dates });
}
