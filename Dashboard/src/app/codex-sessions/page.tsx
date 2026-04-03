"use client";

import { useState, useEffect, useCallback } from "react";

interface CodexSession {
  id: string;
  filename: string;
  date: string;
  timestamp: string;
  query: string;
  result: string;
  model: string;
  cwd: string;
  sizeBytes: number;
  turnCount: number;
}

interface TreeNode {
  name: string;
  path: string;
  sessionCount: number;
  children: TreeNode[];
}

export default function CodexSessionsPage() {
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [dateMode, setDateMode] = useState<"created" | "modified">("created");
  const [treeWidth, setTreeWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = treeWidth;

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.max(150, Math.min(600, startWidth + ev.clientX - startX));
      setTreeWidth(newWidth);
    }
    function onMouseUp() {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedDate) params.set("date", selectedDate);
    params.set("dateMode", dateMode);
    const res = await fetch(`/api/codex-sessions?${params}`);
    const data = await res.json();
    setSessions(data.sessions);
    setTree(data.tree || []);
    setDates(data.dates);
    if (!selectedDate && data.currentDate) setSelectedDate(data.currentDate);
    setLoading(false);
  }, [selectedDate, dateMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function loadDetail(id: string) {
    if (expandedSession === id) {
      setExpandedSession(null);
      setDetail(null);
      return;
    }
    setExpandedSession(id);
    const res = await fetch(
      `/api/codex-sessions?date=${selectedDate}&id=${id}`
    );
    const data = await res.json();
    setDetail(data);
  }

  function toggleNode(path: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // 선택된 프로젝트에 해당하는 세션만 필터
  const filteredSessions = selectedProject
    ? sessions.filter((s) => {
        const cwd = s.cwd || "";
        // paperclip workspace
        const paperclipMatch = cwd.match(/\.paperclip\/instances\/default\/workspaces\/([a-f0-9-]+)/);
        if (paperclipMatch) {
          const root = ".paperclip/workspaces";
          const sub = paperclipMatch[1].slice(0, 8);
          const fullPath = `${root}/${sub}`;
          return selectedProject === root || selectedProject === fullPath;
        }
        // 일반 경로
        const home = "/home/yooha/";
        const normalized = cwd.startsWith(home) ? cwd.slice(home.length) : cwd;
        return normalized.startsWith(selectedProject);
      })
    : sessions;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Codex Search</h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          codex exec 검색 기록 (프로젝트별 트리 뷰)
        </p>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-3">
        <select
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setSelectedProject(null);
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
        <select
          value={dateMode}
          onChange={(e) => {
            setDateMode(e.target.value as "created" | "modified");
            setSelectedDate("");
            setLoading(true);
          }}
          className="px-3 py-1.5 rounded-lg text-sm border outline-none"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <option value="created">Created</option>
          <option value="modified">Last Modified</option>
        </select>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {filteredSessions.length}
          {selectedProject ? ` / ${sessions.length}` : ""} sessions
        </span>
        {selectedProject && (
          <button
            onClick={() => setSelectedProject(null)}
            className="text-xs px-2 py-1 rounded-lg border"
            style={{
              borderColor: "var(--accent-blue)",
              color: "var(--accent-blue)",
              background: "var(--bg-card)",
            }}
          >
            All Projects ✕
          </button>
        )}
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
      ) : (
        <div className="flex" style={{ minHeight: "calc(100vh - 220px)", userSelect: isResizing ? "none" : "auto" }}>
          {/* 좌측: 프로젝트 트리 */}
          <div
            className="flex-shrink-0 rounded-xl border overflow-auto"
            style={{
              width: `${treeWidth}px`,
              background: "var(--bg-card)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="px-3 py-2 border-b text-xs font-medium"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              Projects ({tree.reduce((s, n) => s + n.sessionCount, 0)})
            </div>
            <div className="p-1">
              {/* All */}
              <button
                onClick={() => setSelectedProject(null)}
                className="w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center gap-2"
                style={{
                  background: !selectedProject ? "var(--bg-hover)" : "transparent",
                  color: !selectedProject ? "var(--accent-blue)" : "var(--text-secondary)",
                }}
              >
                <span>📁</span>
                <span className="flex-1">All</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {sessions.length}
                </span>
              </button>

              {tree.map((node) => (
                <div key={node.path}>
                  {/* 루트 노드 */}
                  <button
                    onClick={() => {
                      if (node.children.length > 0) {
                        toggleNode(node.path);
                      } else {
                        setSelectedProject(node.path);
                      }
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center gap-2"
                    style={{
                      background:
                        selectedProject === node.path
                          ? "var(--bg-hover)"
                          : "transparent",
                      color:
                        selectedProject === node.path
                          ? "var(--accent-blue)"
                          : "var(--text-secondary)",
                    }}
                  >
                    <span>
                      {node.children.length > 0
                        ? expandedNodes.has(node.path)
                          ? "▼"
                          : "▶"
                        : "📄"}
                    </span>
                    <span className="flex-1 truncate">{node.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {node.sessionCount}
                    </span>
                  </button>

                  {/* 하위 노드 */}
                  {expandedNodes.has(node.path) &&
                    node.children.map((child) => (
                      <button
                        key={child.path}
                        onClick={() => setSelectedProject(child.path)}
                        className="w-full text-left pl-8 pr-3 py-1.5 rounded-lg text-sm flex items-center gap-2"
                        style={{
                          background:
                            selectedProject === child.path
                              ? "var(--bg-hover)"
                              : "transparent",
                          color:
                            selectedProject === child.path
                              ? "var(--accent-blue)"
                              : "var(--text-muted)",
                        }}
                      >
                        <span>📄</span>
                        <span className="flex-1 truncate">{child.name}</span>
                        <span>{child.sessionCount}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>

          {/* 리사이즈 핸들 */}
          <div
            onMouseDown={handleResizeStart}
            className="w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center hover:bg-blue-500/20 rounded transition-colors"
            style={{ cursor: "col-resize" }}
          >
            <div
              className="w-0.5 h-8 rounded-full"
              style={{ background: isResizing ? "var(--accent-blue)" : "var(--border)" }}
            />
          </div>

          {/* 우측: 세션 목록 */}
          <div className="flex-1 space-y-2 overflow-auto">
            {filteredSessions.length === 0 ? (
              <div
                className="rounded-xl p-8 text-center text-sm"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--text-muted)",
                }}
              >
                세션이 없습니다
              </div>
            ) : (
              filteredSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="rounded-xl border overflow-hidden"
                  style={{
                    background: "var(--bg-card)",
                    borderColor:
                      expandedSession === sess.id
                        ? "var(--accent-blue)"
                        : "var(--border)",
                  }}
                >
                  {/* 세션 헤더 */}
                  <button
                    onClick={() => loadDetail(sess.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                  >
                    <span
                      className="text-xs font-mono flex-shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {sess.timestamp}
                    </span>
                    {sess.model && (
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0"
                        style={{
                          color: "var(--accent-purple)",
                          background: "var(--bg-primary)",
                        }}
                      >
                        {sess.model}
                      </span>
                    )}
                    <span
                      className="text-sm flex-1 truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {sess.query || "(no query)"}
                    </span>
                    {sess.turnCount > 1 && (
                      <span
                        className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                        style={{ color: "var(--accent-blue)", background: "var(--bg-primary)" }}
                      >
                        {sess.turnCount} turns
                      </span>
                    )}
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {(sess.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {expandedSession === sess.id ? "▼" : "▶"}
                    </span>
                  </button>

                  {/* 세션 상세 */}
                  {expandedSession === sess.id && detail && (
                    <div
                      className="border-t px-4 py-4 space-y-3"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {/* 메타 정보 */}
                      <div className="flex gap-4 text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                        <span>CWD: {(detail as Record<string, string>).cwd || sess.cwd}</span>
                      </div>

                      {/* 대화 전체 표시 */}
                      {Array.isArray((detail as Record<string, unknown>).entries) && (() => {
                        const entries = (detail as Record<string, unknown>).entries as { type: string; content: string; turnId?: string }[];

                        // 새 로그는 entry.turnId를 직접 사용하고, 오래된 로그만 fallback 휴리스틱을 사용
                        const skipTypes = new Set(["token_count", "turn_context", "user_message", "message"]);

                        interface TurnGroup {
                          turnId: string;
                          entries: { type: string; content: string; turnId?: string }[];
                          aborted: boolean;
                          completed: boolean;
                        }
                        const turnGroups: TurnGroup[] = [];
                        const turnGroupById = new Map<string, TurnGroup>();
                        const activeTurnIds: string[] = [];

                        const ensureGroup = (turnId: string): TurnGroup => {
                          const existing = turnGroupById.get(turnId);
                          if (existing) return existing;
                          const group: TurnGroup = { turnId, entries: [], aborted: false, completed: false };
                          turnGroups.push(group);
                          turnGroupById.set(turnId, group);
                          return group;
                        };

                        const removeActiveTurn = (turnId: string) => {
                          const idx = activeTurnIds.indexOf(turnId);
                          if (idx !== -1) activeTurnIds.splice(idx, 1);
                        };

                        for (const entry of entries) {
                          const explicitTurnId = entry.turnId || (
                            entry.type === "task_started" || entry.type === "task_complete" || entry.type === "turn_aborted"
                              ? entry.content
                              : ""
                          );

                          if (entry.type === "task_started") {
                            if (!explicitTurnId) continue;
                            ensureGroup(explicitTurnId);
                            if (!activeTurnIds.includes(explicitTurnId)) activeTurnIds.push(explicitTurnId);
                          } else if (entry.type === "task_complete") {
                            if (!explicitTurnId) continue;
                            ensureGroup(explicitTurnId).completed = true;
                            removeActiveTurn(explicitTurnId);
                          } else if (entry.type === "turn_aborted") {
                            if (!explicitTurnId) continue;
                            ensureGroup(explicitTurnId).aborted = true;
                            removeActiveTurn(explicitTurnId);
                          } else if (!skipTypes.has(entry.type)) {
                            if (explicitTurnId) {
                              ensureGroup(explicitTurnId).entries.push(entry);
                            } else if (activeTurnIds.length > 0) {
                              const activeGroups = activeTurnIds
                                .map(turnId => turnGroupById.get(turnId))
                                .filter((group): group is TurnGroup => Boolean(group));

                              if (activeGroups.length === 0) continue;

                              if (entry.type === "answer" || entry.type === "commentary") {
                                const needsAnswer = activeGroups.find(
                                  group => !group.entries.some(existing => existing.type === "answer")
                                );
                                (needsAnswer || activeGroups[activeGroups.length - 1]).entries.push(entry);
                              } else {
                                activeGroups[activeGroups.length - 1].entries.push(entry);
                              }
                            }
                          }
                        }

                        return (
                          <div className="space-y-2">
                            {turnGroups.map((group, gi) => (
                              <div key={gi}>
                                {/* 턴 구분선 */}
                                <div
                                  className="flex items-center gap-2 mt-4 mb-2"
                                  style={{ color: group.aborted ? "var(--accent-red)" : "var(--accent-blue)" }}
                                >
                                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                                  <span className="text-xs font-bold">
                                    Turn {gi + 1}{group.aborted ? " (중단됨)" : ""}
                                  </span>
                                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                                </div>

                                {group.entries.map((entry, i) => {
                                  const isUser = entry.type === "user_query";

                                  let bg = "var(--bg-secondary)";
                                  let color = "var(--text-secondary)";
                                  let label = entry.type;
                                  let align = "justify-start";

                                  if (isUser) {
                                    bg = "var(--accent-blue)";
                                    color = "white";
                                    label = "";
                                    align = "justify-end";
                                  } else if (entry.type === "answer") {
                                    bg = "var(--bg-card)";
                                    color = "var(--text-primary)";
                                    label = "Answer";
                                  } else if (entry.type === "commentary") {
                                    bg = "var(--bg-card)";
                                    color = "var(--text-secondary)";
                                    label = "Commentary";
                                  } else if (entry.type === "thinking") {
                                    bg = "var(--bg-primary)";
                                    color = "var(--text-muted)";
                                    label = "Thinking";
                                  } else if (entry.type === "function_call") {
                                    bg = "var(--bg-primary)";
                                    color = "var(--accent-yellow)";
                                    label = "Tool";
                                  } else if (entry.type === "function_output") {
                                    bg = "var(--bg-primary)";
                                    color = "var(--accent-green)";
                                    label = "Result";
                                  } else if (entry.type === "web_search") {
                                    bg = "var(--bg-primary)";
                                    color = "var(--accent-purple)";
                                    label = "Search";
                                  }

                                  return (
                                    <div key={i}>
                                      <div className={`flex ${align} mb-1`}>
                                        <div
                                          className="max-w-[90%] rounded-xl px-4 py-2 border"
                                          style={{
                                            background: bg,
                                            borderColor: isUser ? bg : "var(--border)",
                                            color,
                                          }}
                                        >
                                          {label && (
                                            <span className="text-xs font-bold mr-2" style={{ opacity: 0.7 }}>
                                              {label}
                                            </span>
                                          )}
                                          <pre className="text-sm whitespace-pre-wrap break-words font-sans inline">
                                            {entry.content}
                                          </pre>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
