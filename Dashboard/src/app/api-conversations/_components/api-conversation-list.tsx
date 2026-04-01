"use client";

import { useState, useEffect, useCallback } from "react";
import type { ApiConversation } from "@/lib/api-log-collector";

function extractUserMessage(input: string): string {
  // 시스템 프롬프트 후 user 메시지 추출
  const userMatch = input.match(
    /\|start\|>user<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/
  );
  if (userMatch) return userMatch[1].trim();

  // 일반 텍스트
  if (input.length > 300) return input.slice(0, 300) + "...";
  return input;
}

function extractAssistantMessage(output: string): string {
  // <|message|> 태그 내용 추출
  const msgMatch = output.match(
    /\|message\|>([\s\S]*?)(?:<\|end\|>|<\|start\|>|$)/
  );
  if (msgMatch) return msgMatch[1].trim();

  if (output.length > 500) return output.slice(0, 500) + "...";
  return output;
}

function extractSystemPrompt(input: string): string {
  const sysMatch = input.match(
    /\|start\|>system<\|message\|>([\s\S]*?)<\|end\|>/
  );
  return sysMatch ? sysMatch[1].trim() : "";
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ApiConversationList() {
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const params = selectedDate ? `?date=${selectedDate}` : "";
    const res = await fetch(`/api/api-conversations${params}`);
    const data = await res.json();
    setConversations(data.conversations);
    setDates(data.dates);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (loading) {
    return (
      <div
        className="rounded-xl p-8 text-center animate-pulse"
        style={{ background: "var(--bg-card)" }}
      >
        Loading API conversations...
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          {conversations.length} API calls
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

      {conversations.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center text-sm"
          style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
        >
          API 대화 기록이 없습니다.
          <br />
          <span className="text-xs">
            대시보드가 실행되는 동안 LM Studio API 호출이 자동 기록됩니다.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const userMsg = extractUserMessage(conv.input);
            const assistantMsg = extractAssistantMessage(conv.output);
            const systemPrompt = extractSystemPrompt(conv.input);
            const isExpanded = expandedId === conv.id;

            return (
              <div
                key={`${conv.timestamp}-${conv.id}`}
                className="rounded-xl border overflow-hidden"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border)",
                }}
              >
                {/* 헤더 */}
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : conv.id)
                  }
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                >
                  <span
                    className="text-xs font-mono flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatTimestamp(conv.timestamp)}
                  </span>
                  <span
                    className="text-xs font-mono flex-shrink-0 px-2 py-0.5 rounded"
                    style={{
                      color: "var(--accent-purple)",
                      background: "var(--bg-primary)",
                    }}
                  >
                    {conv.model}
                  </span>
                  <span
                    className="text-sm truncate flex-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {userMsg.slice(0, 80)}
                  </span>
                  {conv.stats && (
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: "var(--accent-yellow)" }}
                    >
                      {conv.stats.tokensPerSecond?.toFixed(1)} tok/s
                    </span>
                  )}
                  <span style={{ color: "var(--text-muted)" }}>
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </button>

                {/* 펼침 */}
                {isExpanded && (
                  <div
                    className="border-t px-4 py-4 space-y-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {/* 시스템 프롬프트 */}
                    {systemPrompt && (
                      <div>
                        <button
                          onClick={() =>
                            setShowSystemPrompt(
                              showSystemPrompt === conv.id
                                ? null
                                : conv.id
                            )
                          }
                          className="text-xs font-medium"
                          style={{ color: "var(--accent-purple)" }}
                        >
                          System Prompt{" "}
                          {showSystemPrompt === conv.id ? "▼" : "▶"}
                        </button>
                        {showSystemPrompt === conv.id && (
                          <pre
                            className="mt-2 text-xs whitespace-pre-wrap overflow-auto max-h-48 p-3 rounded-lg"
                            style={{
                              background: "var(--bg-primary)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {systemPrompt}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* 사용자 메시지 */}
                    <div className="flex justify-end">
                      <div
                        className="max-w-[80%] rounded-xl px-4 py-3"
                        style={{ background: "var(--accent-blue)" }}
                      >
                        <pre className="text-sm whitespace-pre-wrap break-words font-sans text-white">
                          {userMsg}
                        </pre>
                      </div>
                    </div>

                    {/* 어시스턴트 응답 */}
                    <div className="flex justify-start">
                      <div
                        className="max-w-[80%] rounded-xl px-4 py-3 border"
                        style={{
                          background: "var(--bg-secondary)",
                          borderColor: "var(--border)",
                        }}
                      >
                        <p
                          className="text-xs mb-1 font-medium"
                          style={{ color: "var(--accent-green)" }}
                        >
                          {conv.model}
                        </p>
                        <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                          {assistantMsg}
                        </pre>
                        {conv.stats && (
                          <div
                            className="mt-2 flex gap-3 text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {conv.stats.tokensPerSecond && (
                              <span>
                                {conv.stats.tokensPerSecond.toFixed(1)}{" "}
                                tok/s
                              </span>
                            )}
                            {conv.stats.predictedTokensCount && (
                              <span>
                                {conv.stats.predictedTokensCount} tokens
                              </span>
                            )}
                            {conv.stats.totalTimeSec && (
                              <span>
                                {conv.stats.totalTimeSec.toFixed(1)}s
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 전체 원본 토글 */}
                    <details className="text-xs">
                      <summary
                        className="cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Raw Input/Output
                      </summary>
                      <div className="mt-2 space-y-2">
                        <pre
                          className="p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap"
                          style={{
                            background: "var(--bg-primary)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {conv.input}
                        </pre>
                        <pre
                          className="p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap"
                          style={{
                            background: "var(--bg-primary)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {conv.output}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
