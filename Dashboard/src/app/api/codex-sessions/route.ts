import { NextResponse } from "next/server";
import {
  getAvailableCodexDates,
  listCodexSessions,
  getCodexSessionDetail,
  deleteCodexSessions,
  deleteCodexSessionsByDate,
  buildProjectTree,
} from "@/lib/codex-session-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const id = searchParams.get("id");
  const dateMode = searchParams.get("dateMode") || "created";

  if (id && date) {
    const detail = getCodexSessionDetail(date, id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail);
  }

  const dates = getAvailableCodexDates(dateMode);
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  let targetDate = date || localToday;
  let sessions = listCodexSessions(targetDate, dateMode);

  // Today에 데이터가 없으면 가장 최근 날짜로 폴백
  if (!date && sessions.length === 0 && dates.length > 0) {
    targetDate = dates[0];
    sessions = listCodexSessions(targetDate, dateMode);
  }

  const tree = buildProjectTree(sessions);
  return NextResponse.json({ sessions, dates, currentDate: targetDate, tree });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = body.action;

  if (action === "delete" && body.date && body.ids) {
    const count = deleteCodexSessions(body.date, body.ids);
    return NextResponse.json({ success: true, deleted: count });
  }

  if (action === "delete_day" && body.date) {
    const count = deleteCodexSessionsByDate(body.date);
    return NextResponse.json({ success: true, deleted: count });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
