"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ApiSession, ApiTurn } from "@/lib/api-session-parser";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Tool Call JSON에서 핵심만 추출
function extractToolSummary(content: string): { tool: string; summary: string } {
  try {
    const obj = JSON.parse(content);
    if (obj.command) {
      const cmd = obj.command.length > 120 ? obj.command.slice(0, 120) + "..." : obj.command;
      return { tool: "Bash", summary: cmd };
    }
    if (obj.file_path) {
      return { tool: "Read", summary: obj.file_path };
    }
    if (obj.old_string) {
      return { tool: "Edit", summary: obj.file_path || "file" };
    }
  } catch {
    // not JSON
  }
  const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;
  return { tool: "Tool", summary: preview };
}

// Tool Result 요약
function summarizeResult(content: string): string {
  const lines = content.split("\n");
  if (lines.length <= 3) return content;
  return lines.slice(0, 3).join("\n") + `\n... (${lines.length} lines)`;
}

// User 메시지에서 system-reminder 보일러플레이트 제거
function cleanUserMessage(content: string): string {
  // <system-reminder>...</system-reminder> 제거
  const cleaned = content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  return cleaned || content;
}

// 턴들을 그룹으로 묶기: tool_call+tool_result 쌍, 나머지는 독립
interface TurnGroup {
  type: "meta" | "user" | "assistant" | "tool_pair" | "other";
  turns: { turn: ApiTurn; index: number }[];
}

function groupTurns(turns: ApiTurn[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let i = 0;

  while (i < turns.length) {
    const t = turns[i];

    if (t.role === "system" || t.role === "developer") {
      groups.push({ type: "meta", turns: [{ turn: t, index: i }] });
      i++;
    } else if (t.role === "tool_call" && i + 1 < turns.length && turns[i + 1].role === "tool_result") {
      groups.push({
        type: "tool_pair",
        turns: [
          { turn: t, index: i },
          { turn: turns[i + 1], index: i + 1 },
        ],
      });
      i += 2;
    } else if (t.role === "user") {
      groups.push({ type: "user", turns: [{ turn: t, index: i }] });
      i++;
    } else if (t.role === "assistant") {
      groups.push({ type: "assistant", turns: [{ turn: t, index: i }] });
      i++;
    } else {
      groups.push({ type: "other", turns: [{ turn: t, index: i }] });
      i++;
    }
  }
  return groups;
}

function MetaBlock({ turn, index }: { turn: ApiTurn; index: number }) {
  const [open, setOpen] = useState(false);
  const label = turn.role === "system" ? "System" : "Developer";
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs font-medium"
        style={{ color: "var(--accent-purple)" }}
      >
        {label} ({turn.content.length.toLocaleString()} chars) {open ? "▼" : "▶"}
      </button>
      {open && (
        <pre
          className="mt-1 p-3 rounded-lg text-xs whitespace-pre-wrap overflow-auto max-h-64"
          style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}
        >
          {turn.content}
        </pre>
      )}
    </div>
  );
}

function ToolPairBlock({
  call,
  result,
  callIdx,
}: {
  call: ApiTurn;
  result: ApiTurn;
  callIdx: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { tool, summary } = extractToolSummary(call.content);
  const resultPreview = summarizeResult(result.content);
  const isError =
    result.content.includes("Error") ||
    result.content.includes("error") ||
    result.content.includes("Exit code 1");

  return (
    <div
      className="mb-2 rounded-lg border overflow-hidden"
      style={{
        borderColor: isError ? "var(--accent-red)" : "var(--border)",
        background: "var(--bg-secondary)",
      }}
    >
      {/* 요약 헤더 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center gap-2 text-xs"
      >
        <span
          className="font-bold px-1.5 py-0.5 rounded"
          style={{
            color: "var(--accent-yellow)",
            background: "var(--bg-primary)",
          }}
        >
          {tool}
        </span>
        <span
          className="font-mono flex-1 truncate"
          style={{ color: "var(--text-secondary)" }}
        >
          {summary}
        </span>
        {isError && (
          <span style={{ color: "var(--accent-red)" }}>error</span>
        )}
        <span style={{ color: "var(--text-muted)" }}>
          #{callIdx} {expanded ? "▼" : "▶"}
        </span>
      </button>

      {/* 펼침: 결과 */}
      {expanded && (
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-xs mb-1 font-medium" style={{ color: "var(--accent-yellow)" }}>
            Call:
          </p>
          <pre
            className="text-xs whitespace-pre-wrap mb-2 p-2 rounded overflow-auto max-h-32"
            style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}
          >
            {call.content}
          </pre>
          <p
            className="text-xs mb-1 font-medium"
            style={{ color: isError ? "var(--accent-red)" : "var(--accent-green)" }}
          >
            Result:
          </p>
          <pre
            className="text-xs whitespace-pre-wrap p-2 rounded overflow-auto max-h-48"
            style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}
          >
            {result.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function UserBubble({ turn }: { turn: ApiTurn }) {
  const [showFull, setShowFull] = useState(false);
  const cleaned = cleanUserMessage(turn.content);
  const hasBoilerplate = cleaned !== turn.content;
  const display = cleaned.length > 300 && !showFull ? cleaned.slice(0, 300) + "..." : cleaned;

  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[80%] rounded-xl px-4 py-3" style={{ background: "var(--accent-blue)" }}>
        {hasBoilerplate && (
          <p className="text-xs mb-1 opacity-60">
            (system-reminder 생략됨)
          </p>
        )}
        <pre className="text-sm whitespace-pre-wrap break-words font-sans text-white">
          {display}
        </pre>
        {cleaned.length > 300 && (
          <button
            onClick={() => setShowFull(!showFull)}
            className="text-xs mt-1 text-white/70"
          >
            {showFull ? "접기" : `전체 보기 (${cleaned.length.toLocaleString()} chars)`}
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({ turn }: { turn: ApiTurn }) {
  const [showFull, setShowFull] = useState(false);

  // <|channel|>...<|message|> 태그 정리
  let content = turn.content;
  // final 채널 메시지 추출
  const finalMatch = content.match(/final[\s\S]*?\|message\|>([\s\S]*?)$/);
  if (finalMatch) content = finalMatch[1].trim();
  // analysis 채널이면 thinking으로 표시
  const isThinking = turn.content.includes("<|channel|>analysis");

  const display = content.length > 500 && !showFull ? content.slice(0, 500) + "..." : content;

  return (
    <div className="flex justify-start mb-3">
      <div
        className="max-w-[80%] rounded-xl px-4 py-3 border"
        style={{
          background: isThinking ? "var(--bg-primary)" : "var(--bg-card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs font-bold"
            style={{ color: isThinking ? "var(--text-muted)" : "var(--accent-green)" }}
          >
            {isThinking ? "Thinking" : "Assistant"}
          </span>
          {turn.model && (
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              {turn.model}
            </span>
          )}
        </div>
        <pre
          className="text-sm whitespace-pre-wrap break-words font-sans"
          style={{ color: isThinking ? "var(--text-muted)" : "var(--text-primary)" }}
        >
          {display}
        </pre>
        {content.length > 500 && (
          <button
            onClick={() => setShowFull(!showFull)}
            className="text-xs mt-1"
            style={{ color: "var(--accent-blue)" }}
          >
            {showFull ? "접기" : `전체 보기 (${content.length.toLocaleString()} chars)`}
          </button>
        )}
        {turn.stats && (
          <div className="mt-2 flex gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
            {turn.stats.tokensPerSecond && (
              <span>{turn.stats.tokensPerSecond.toFixed(1)} tok/s</span>
            )}
            {turn.stats.predictedTokensCount && (
              <span>{turn.stats.predictedTokensCount} tokens</span>
            )}
            {turn.stats.totalTimeSec && (
              <span>{turn.stats.totalTimeSec.toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApiSessionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/api-sessions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setSession(null);
        else setSession(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded" style={{ background: "var(--bg-card)" }} />
        <div className="h-96 rounded-xl" style={{ background: "var(--bg-card)" }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        세션을 찾을 수 없습니다
      </div>
    );
  }

  const groups = groupTurns(session.turns);

  // 통계
  const toolCalls = session.turns.filter((t) => t.role === "tool_call").length;
  const assistantMsgs = session.turns.filter((t) => t.role === "assistant").length;

  return (
    <div className="space-y-4 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href="/api-sessions"
          className="text-sm px-3 py-1 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          ← Back
        </Link>
        <div>
          <h2 className="text-lg font-bold">Session {id}</h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {session.model} · {formatTime(session.startTime)} ·{" "}
            {assistantMsgs} responses · {toolCalls} tool calls ·{" "}
            {session.totalTokens.toLocaleString()} tokens
          </p>
        </div>
      </div>

      {/* 그룹별 렌더링 */}
      <div>
        {groups.map((group, gi) => {
          if (group.type === "meta") {
            return (
              <MetaBlock
                key={gi}
                turn={group.turns[0].turn}
                index={group.turns[0].index}
              />
            );
          }
          if (group.type === "tool_pair") {
            return (
              <ToolPairBlock
                key={gi}
                call={group.turns[0].turn}
                result={group.turns[1].turn}
                callIdx={group.turns[0].index}
              />
            );
          }
          if (group.type === "user") {
            return <UserBubble key={gi} turn={group.turns[0].turn} />;
          }
          if (group.type === "assistant") {
            return <AssistantBubble key={gi} turn={group.turns[0].turn} />;
          }
          // other
          return (
            <pre
              key={gi}
              className="text-xs p-2 rounded mb-2 whitespace-pre-wrap"
              style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
            >
              {group.turns[0].turn.content.slice(0, 200)}
            </pre>
          );
        })}
      </div>
    </div>
  );
}
