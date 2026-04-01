"use client";

import { useRef, useEffect } from "react";
import { useSSE } from "@/hooks/use-sse";
import type { LogStreamEvent } from "@/lib/types";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function LiveLogViewer() {
  const { entries, connected, paused, togglePause, clear } =
    useSSE<LogStreamEvent>("/api/logs/stream", 1000);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, paused]);

  return (
    <div className="space-y-3">
      {/* 컨트롤 바 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: connected
                ? "var(--accent-green)"
                : "var(--accent-red)",
            }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <span
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {entries.length} entries
        </span>

        <div className="flex-1" />

        <button
          onClick={togglePause}
          className="text-xs px-3 py-1 rounded-lg border"
          style={{
            borderColor: "var(--border)",
            color: paused ? "var(--accent-yellow)" : "var(--text-secondary)",
            background: "var(--bg-card)",
          }}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>

        <button
          onClick={clear}
          className="text-xs px-3 py-1 rounded-lg border"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
            background: "var(--bg-card)",
          }}
        >
          Clear
        </button>
      </div>

      {/* 로그 창 */}
      <div
        ref={scrollRef}
        className="rounded-xl border overflow-auto font-mono text-xs"
        style={{
          background: "var(--bg-primary)",
          borderColor: "var(--border)",
          height: "calc(100vh - 200px)",
        }}
      >
        {entries.length === 0 ? (
          <div
            className="p-8 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            {connected
              ? "Waiting for log events..."
              : "Connecting to log stream..."}
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {entries.map((entry, i) => {
              const isInput = entry.data?.type === "llm.prediction.input";
              const isOutput = entry.data?.type === "llm.prediction.output";
              const hasError = "error" in entry;

              let color = "var(--text-muted)";
              let label = "???";
              if (isInput) {
                color = "var(--accent-blue)";
                label = "INPUT";
              } else if (isOutput) {
                color = "var(--accent-green)";
                label = "OUTPUT";
              } else if (hasError) {
                color = "var(--accent-red)";
                label = "ERROR";
              }

              const content =
                entry.data?.input ||
                entry.data?.output ||
                (entry as unknown as { error?: string }).error ||
                "";
              const model = entry.data?.modelIdentifier || "";
              const stats = entry.data?.stats;
              const preview =
                content.length > 300
                  ? content.slice(0, 300) + "..."
                  : content;

              return (
                <div
                  key={i}
                  className="flex gap-2 py-1 px-2 rounded hover:bg-white/5"
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span
                    className="font-bold w-14 text-right flex-shrink-0"
                    style={{ color }}
                  >
                    {label}
                  </span>
                  {model && (
                    <span
                      className="flex-shrink-0"
                      style={{ color: "var(--accent-purple)" }}
                    >
                      [{model}]
                    </span>
                  )}
                  <span
                    className="break-all"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {preview}
                  </span>
                  {stats && (
                    <span
                      className="flex-shrink-0 ml-auto"
                      style={{ color: "var(--accent-yellow)" }}
                    >
                      {stats.tokensPerSecond?.toFixed(1)} tok/s
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
