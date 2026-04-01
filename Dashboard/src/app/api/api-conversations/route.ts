import { NextResponse } from "next/server";
import {
  startCollector,
  getApiConversations,
  getAvailableDates,
} from "@/lib/api-log-collector";

export const dynamic = "force-dynamic";

// 서버 시작 시 로그 수집 시작
startCollector();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || undefined;
  const limit = parseInt(searchParams.get("limit") || "100");

  const conversations = getApiConversations(date, limit);
  const dates = getAvailableDates();

  return NextResponse.json({ conversations, dates });
}
