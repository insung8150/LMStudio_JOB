"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface Message {
  role: string;
  text: string;
  model?: string;
  stats?: {
    tokensPerSecond?: number;
    totalTimeSec?: number;
    predictedTokensCount?: number;
  };
}

interface ConvDetail {
  id: string;
  name: string;
  createdAt: number;
  tokenCount: number;
  systemPrompt: string;
  modelName: string;
  messages: Message[];
}

export default function ConversationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  useEffect(() => {
    fetch(`/api/conversations/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setConv(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded" style={{ background: "var(--bg-card)" }} />
        <div className="h-64 rounded-xl" style={{ background: "var(--bg-card)" }} />
      </div>
    );
  }

  if (!conv) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        대화를 찾을 수 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href="/conversations"
          className="text-sm px-3 py-1 rounded-lg border"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          ← Back
        </Link>
        <div>
          <h2 className="text-lg font-bold">{conv.name}</h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {conv.modelName} · {formatDate(conv.createdAt)} ·{" "}
            {conv.tokenCount.toLocaleString()} tokens
          </p>
        </div>
      </div>

      {/* 시스템 프롬프트 */}
      {conv.systemPrompt && (
        <div
          className="rounded-xl border p-3"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          <button
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className="text-xs font-medium w-full text-left"
            style={{ color: "var(--accent-purple)" }}
          >
            System Prompt {showSystemPrompt ? "▼" : "▶"}
          </button>
          {showSystemPrompt && (
            <pre
              className="mt-2 text-xs whitespace-pre-wrap overflow-auto max-h-64"
              style={{ color: "var(--text-secondary)" }}
            >
              {conv.systemPrompt}
            </pre>
          )}
        </div>
      )}

      {/* 메시지들 */}
      <div className="space-y-3">
        {conv.messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[80%] rounded-xl px-4 py-3 border"
              style={{
                background:
                  msg.role === "user"
                    ? "var(--accent-blue)"
                    : "var(--bg-card)",
                borderColor:
                  msg.role === "user"
                    ? "var(--accent-blue)"
                    : "var(--border)",
                color:
                  msg.role === "user" ? "white" : "var(--text-primary)",
              }}
            >
              {/* 모델 이름 */}
              {msg.role === "assistant" && msg.model && (
                <p
                  className="text-xs mb-1 font-medium"
                  style={{ color: "var(--accent-green)" }}
                >
                  {msg.model}
                </p>
              )}

              {/* 메시지 내용 */}
              <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                {msg.text}
              </pre>

              {/* 통계 배지 */}
              {msg.stats && (
                <div
                  className="mt-2 flex gap-3 text-xs"
                  style={{
                    color:
                      msg.role === "user"
                        ? "rgba(255,255,255,0.7)"
                        : "var(--text-muted)",
                  }}
                >
                  {msg.stats.tokensPerSecond && (
                    <span>
                      {msg.stats.tokensPerSecond.toFixed(1)} tok/s
                    </span>
                  )}
                  {msg.stats.predictedTokensCount && (
                    <span>{msg.stats.predictedTokensCount} tokens</span>
                  )}
                  {msg.stats.totalTimeSec && (
                    <span>{msg.stats.totalTimeSec.toFixed(1)}s</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
