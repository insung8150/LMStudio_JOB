"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SessionSummary {
  id: string;
  startTime: number;
  endTime: number;
  model: string;
  turnCount: number;
  totalTokens: number;
  lastTokPerSec: number;
  agentLabel: string;
  turnPreview: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(startMs: number, endMs: number): string {
  const sec = Math.round((endMs - startMs) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainder = sec % 60;
  return `${min}m ${remainder}s`;
}

export default function ApiSessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const params = selectedDate ? `?date=${selectedDate}` : "";
    const res = await fetch(`/api/api-sessions${params}`);
    const data = await res.json();
    setSessions(data.sessions);
    setDates(data.dates);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000);
    return () => clearInterval(timer);
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">API Sessions</h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          멀티턴 대화를 세션별로 그룹핑 (내용 포함 관계 기반)
        </p>
      </div>

      {/* 날짜 선택 */}
      <div className="flex items-center gap-3">
        <select
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setLoading(true);
          }}
          className="px-3 py-1.5 rounded-lg text-sm border outline-none"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <option value="">Today</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {sessions.length} sessions
        </span>
        <button
          onClick={fetchData}
          className="text-xs px-3 py-1 rounded-lg border ml-auto"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
            background: "var(--bg-card)",
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div
          className="rounded-xl p-8 animate-pulse"
          style={{ background: "var(--bg-card)" }}
        />
      ) : sessions.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center text-sm"
          style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
        >
          세션이 없습니다. 대시보드 실행 중 API 호출이 자동 기록됩니다.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((sess) => (
            <Link
              key={sess.id}
              href={`/api-sessions/${sess.id}`}
              className="block rounded-xl border p-4 transition-colors hover:border-blue-500/50"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatTime(sess.startTime)}
                  {sess.startTime !== sess.endTime &&
                    ` → ${formatTime(sess.endTime)}`}
                </span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{
                    color: "var(--accent-green)",
                    background: "var(--bg-primary)",
                  }}
                >
                  {sess.agentLabel}
                </span>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{
                    color: "var(--accent-purple)",
                    background: "var(--bg-primary)",
                  }}
                >
                  {sess.model}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    color: "var(--accent-blue)",
                    background: "var(--bg-primary)",
                  }}
                >
                  {sess.turnCount} turns
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatDuration(sess.startTime, sess.endTime)}
                </span>
                <div className="flex-1" />
                {sess.lastTokPerSec > 0 && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--accent-yellow)" }}
                  >
                    {sess.lastTokPerSec.toFixed(1)} tok/s
                  </span>
                )}
                {sess.totalTokens > 0 && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {sess.totalTokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
              {sess.turnPreview && (
                <p
                  className="text-sm truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {sess.turnPreview}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
