import { readFileSync, existsSync, readdirSync, unlinkSync, renameSync, mkdirSync, statSync } from "fs";
import { join } from "path";

const CODEX_SESSIONS_DIR = "/home/yooha/.codex/sessions";

export interface CodexSession {
  id: string;
  filename: string;
  date: string;
  timestamp: string;
  query: string;
  result: string;
  model: string;
  tokenCount?: number;
  sizeBytes: number;
  cwd: string;
  turnCount: number; // resume 포함 총 턴 수
}

export interface ProjectTreeNode {
  name: string;
  path: string;
  sessionCount: number;
  children: ProjectTreeNode[];
}

export interface CodexSessionDetail {
  id: string;
  filename: string;
  date: string;
  timestamp: string;
  query: string;
  result: string;
  model: string;
  systemPrompt: string;
  agentsInstructions: string;
  tokenInfo?: Record<string, unknown>;
  entries: { type: string; content: string; turnId?: string }[];
  turnCount: number;
}

function parseSessionFile(filepath: string): {
  query: string;
  result: string;
  model: string;
  cwd: string;
  systemPrompt: string;
  agentsInstructions: string;
  tokenInfo?: Record<string, unknown>;
  entries: { type: string; content: string; turnId?: string }[];
  turnCount: number;
} {
  const raw = readFileSync(filepath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);

  let query = "";
  let result = "";
  let model = "";
  let cwd = "";
  let systemPrompt = "";
  let agentsInstructions = "";
  let tokenInfo: Record<string, unknown> | undefined;
  const entries: { type: string; content: string; turnId?: string }[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const type = entry.type || "unknown";
      const payload = entry.payload || {};

      if (type === "session_meta") {
        model = payload.model || "";
        if (payload.cwd) cwd = payload.cwd;
      } else if (type === "event_msg") {
        const msgType = payload.type || "";
        if (msgType === "user_message") {
          if (!query) {
            query = payload.message || "";  // 첫 번째만 요약용
          }
          // 모든 user_message를 entries에 별도 타입으로 추가
          entries.push({
            type: "user_query",
            content: (payload.message || "").slice(0, 2000),
            turnId: payload.turn_id || undefined,
          });
        } else if (msgType === "agent_message") {
          const phase = payload.phase || "";
          const msg = payload.message || "";
          if (phase === "final_answer") {
            entries.push({ type: "answer", content: msg.slice(0, 5000), turnId: payload.turn_id || undefined });
          } else if (phase === "commentary") {
            // commentary도 응답 후보로 추가 (final_answer 없이 턴이 끝날 수 있음)
            entries.push({ type: "commentary", content: msg.slice(0, 5000), turnId: payload.turn_id || undefined });
          } else {
            entries.push({ type: "thinking", content: msg.slice(0, 2000), turnId: payload.turn_id || undefined });
          }
        } else if (msgType === "task_started") {
          entries.push({ type: "task_started", content: payload.turn_id || "", turnId: payload.turn_id || undefined });
        } else if (msgType === "task_complete") {
          entries.push({ type: "task_complete", content: payload.turn_id || "", turnId: payload.turn_id || undefined });
        } else if (msgType === "turn_aborted") {
          entries.push({ type: "turn_aborted", content: payload.turn_id || "", turnId: payload.turn_id || undefined });
        } else if (msgType === "token_count") {
          tokenInfo = payload;
        }
      } else if (type === "response_item") {
        const item = payload.item || payload;
        const itype = item.type || "";

        if (itype === "message") {
          const contentParts = item.content || [];
          let text = "";
          if (Array.isArray(contentParts)) {
            for (const c of contentParts) {
              if (typeof c === "object" && c.text) text += c.text;
            }
          }

          if (text.includes("<permissions") || text.includes("<skills_instructions>")) {
            systemPrompt = text.slice(0, 3000);
          } else if (text.includes("AGENTS.md") || text.includes("# Instructions") || text.includes("# Global Instructions")) {
            agentsInstructions = text.slice(0, 3000);
          } else if (text.trim()) {
            result = text;
            // commentary/answer와 중복되지 않는 긴 응답만 추가
            // (짧은 것은 대부분 agent_message와 중복)
          }
        } else if (itype === "web_search_call") {
          const action = item.action || {};
          const query = action.query || action.queries?.[0] || item.query || "";
          if (query) {
            entries.push({
              type: "web_search",
              content: typeof query === "string" ? query.slice(0, 300) : JSON.stringify(query).slice(0, 300),
              turnId: item.turn_id || undefined,
            });
          }
        } else if (itype === "function_call") {
          entries.push({
            type: "function_call",
            content: `${item.name || "?"}: ${(item.arguments || "").slice(0, 300)}`,
            turnId: item.turn_id || undefined,
          });
        } else if (itype === "function_call_output") {
          entries.push({
            type: "function_output",
            content: (item.output || "").slice(0, 500),
            turnId: item.turn_id || undefined,
          });
        }
      } else if (type === "turn_context") {
        if (payload.cwd && !cwd) cwd = payload.cwd;
        entries.push({ type, content: JSON.stringify(payload).slice(0, 300), turnId: payload.turn_id || undefined });
      }
    } catch {
      // skip
    }
  }

  const turnCount = entries.filter((e) => e.type === "user_query").length;
  return { query, result, model, cwd, systemPrompt, agentsInstructions, tokenInfo, entries, turnCount };
}

function toLocalDateStr(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// dateMode: "created" = 폴더 날짜(생성일), "modified" = 파일 mtime(최종 수정일)
export function getAvailableCodexDates(dateMode: string = "created"): string[] {
  if (!existsSync(CODEX_SESSIONS_DIR)) return [];

  if (dateMode === "created") {
    // 기존: 폴더 구조에서 날짜 추출
    const years = readdirSync(CODEX_SESSIONS_DIR).filter((d) => /^\d{4}$/.test(d));
    const dates: string[] = [];
    for (const year of years) {
      const yearDir = join(CODEX_SESSIONS_DIR, year);
      const months = readdirSync(yearDir).filter((d) => /^\d{2}$/.test(d));
      for (const month of months) {
        const monthDir = join(yearDir, month);
        const days = readdirSync(monthDir).filter((d) => /^\d{2}$/.test(d));
        for (const day of days) {
          dates.push(`${year}-${month}-${day}`);
        }
      }
    }
    return dates.sort().reverse();
  }

  // modified: 모든 파일의 mtime에서 날짜 추출
  const dates = new Set<string>();
  const years = readdirSync(CODEX_SESSIONS_DIR).filter((d) => /^\d{4}$/.test(d));
  for (const year of years) {
    const yearDir = join(CODEX_SESSIONS_DIR, year);
    const months = readdirSync(yearDir).filter((d) => /^\d{2}$/.test(d));
    for (const month of months) {
      const monthDir = join(yearDir, month);
      const days = readdirSync(monthDir).filter((d) => /^\d{2}$/.test(d));
      for (const day of days) {
        const dayDir = join(monthDir, day);
        for (const f of readdirSync(dayDir).filter((f) => f.endsWith(".jsonl"))) {
          try {
            const mtime = statSync(join(dayDir, f)).mtimeMs;
            dates.add(toLocalDateStr(new Date(mtime)));
          } catch {}
        }
      }
    }
  }
  return Array.from(dates).sort().reverse();
}

export function listCodexSessions(date: string, dateMode: string = "created"): CodexSession[] {
  if (dateMode === "modified") {
    // mtime 기준: 모든 폴더를 스캔해서 mtime이 해당 날짜인 파일만 수집
    return listCodexSessionsByMtime(date);
  }

  // created 기준: 해당 날짜 폴더에서 직접 읽기
  const parts = date.split("-");
  const dirPath = join(CODEX_SESSIONS_DIR, parts[0], parts[1], parts[2]);

  if (!existsSync(dirPath)) return [];

  const files = readdirSync(dirPath)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  return files.map((filename) => {
    const filepath = join(dirPath, filename);
    const stat = statSync(filepath);

    try {
      const parsed = parseSessionFile(filepath);
      // rollout-2026-04-01T22-13-58-UUID.jsonl → 22:13:58
      const timeMatch = filename.match(/T(\d{2})-(\d{2})-(\d{2})/);
      const timestamp = timeMatch
        ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`
        : "";

      return {
        id: filename.replace(".jsonl", ""),
        filename,
        date,
        timestamp,
        query: parsed.query.slice(0, 200),
        result: parsed.result.slice(0, 200),
        model: parsed.model,
        cwd: parsed.cwd,
        sizeBytes: stat.size,
        turnCount: parsed.turnCount,
      };
    } catch {
      return {
        id: filename.replace(".jsonl", ""),
        filename,
        date,
        timestamp: "",
        query: "(parse error)",
        result: "",
        model: "",
        cwd: "",
        sizeBytes: stat.size,
        turnCount: 0,
      };
    }
  });
}

export function getCodexSessionDetail(date: string, id: string): CodexSessionDetail | null {
  const parts = date.split("-");
  const filepath = join(CODEX_SESSIONS_DIR, parts[0], parts[1], parts[2], `${id}.jsonl`);

  if (!existsSync(filepath)) return null;

  try {
    const parsed = parseSessionFile(filepath);
    const timeMatch = id.match(/T(\d{2})-(\d{2})-(\d{2})/);
    const timestamp = timeMatch
      ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`
      : "";

    return {
      id,
      filename: `${id}.jsonl`,
      date,
      timestamp,
      ...parsed,
    };
  } catch {
    return null;
  }
}

export function deleteCodexSessions(date: string, ids: string[]): number {
  const parts = date.split("-");
  const dirPath = join(CODEX_SESSIONS_DIR, parts[0], parts[1], parts[2]);
  const trashDir = join(dirPath, ".trash");

  if (!existsSync(dirPath)) return 0;

  mkdirSync(trashDir, { recursive: true });

  let deleted = 0;
  for (const id of ids) {
    const filepath = join(dirPath, `${id}.jsonl`);
    if (existsSync(filepath)) {
      try {
        renameSync(filepath, join(trashDir, `${id}.jsonl`));
        deleted++;
      } catch {
        // skip
      }
    }
  }
  return deleted;
}

export function deleteCodexSessionsByDate(date: string): number {
  const parts = date.split("-");
  const dirPath = join(CODEX_SESSIONS_DIR, parts[0], parts[1], parts[2]);

  if (!existsSync(dirPath)) return 0;

  const trashDir = join(dirPath, ".trash");
  mkdirSync(trashDir, { recursive: true });

  const files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
  let deleted = 0;
  for (const f of files) {
    try {
      renameSync(join(dirPath, f), join(trashDir, f));
      deleted++;
    } catch {
      // skip
    }
  }
  return deleted;
}

// cwd를 [프로젝트 루트, 하위 경로]로 변환
function listCodexSessionsByMtime(date: string): CodexSession[] {
  if (!existsSync(CODEX_SESSIONS_DIR)) return [];

  const results: CodexSession[] = [];
  const years = readdirSync(CODEX_SESSIONS_DIR).filter((d) => /^\d{4}$/.test(d));

  for (const year of years) {
    const yearDir = join(CODEX_SESSIONS_DIR, year);
    const months = readdirSync(yearDir).filter((d) => /^\d{2}$/.test(d));
    for (const month of months) {
      const monthDir = join(yearDir, month);
      const days = readdirSync(monthDir).filter((d) => /^\d{2}$/.test(d));
      for (const day of days) {
        const dayDir = join(monthDir, day);
        const createdDate = `${year}-${month}-${day}`;
        const files = readdirSync(dayDir).filter((f) => f.endsWith(".jsonl"));

        for (const filename of files) {
          const filepath = join(dayDir, filename);
          try {
            const stat = statSync(filepath);
            const mtimeDate = toLocalDateStr(new Date(stat.mtimeMs));
            if (mtimeDate !== date) continue;

            const parsed = parseSessionFile(filepath);
            const timeMatch = filename.match(/T(\d{2})-(\d{2})-(\d{2})/);
            const timestamp = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}` : "";

            results.push({
              id: filename.replace(".jsonl", ""),
              filename,
              date: createdDate,
              timestamp,
              query: parsed.query.slice(0, 200),
              result: parsed.result.slice(0, 200),
              model: parsed.model,
              cwd: parsed.cwd,
              sizeBytes: stat.size,
              turnCount: parsed.turnCount,
            });
          } catch {}
        }
      }
    }
  }

  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function cwdToProject(cwd: string): { root: string; sub: string } {
  if (!cwd) return { root: "unknown", sub: "" };

  // Paperclip workspace
  const paperclipMatch = cwd.match(/\.paperclip\/instances\/default\/workspaces\/([a-f0-9-]+)/);
  if (paperclipMatch) {
    return { root: ".paperclip/workspaces", sub: paperclipMatch[1].slice(0, 8) };
  }

  // 홈 디렉토리 제거
  const home = "/home/yooha/";
  const normalized = cwd.startsWith(home) ? cwd.slice(home.length) : cwd;

  // git root처럼 2단계까지를 프로젝트 루트로 간주
  // 예: JOB_FOLD/Paperclip → root="JOB_FOLD/Paperclip", sub=""
  //     JOB_FOLD/LLM_test/LMStudio_JOB → root="JOB_FOLD/LLM_test", sub="LMStudio_JOB"
  const parts = normalized.split("/");
  if (parts.length <= 2) {
    return { root: normalized, sub: "" };
  }
  return { root: parts.slice(0, 2).join("/"), sub: parts.slice(2).join("/") };
}

// 세션 목록에서 프로젝트 트리 생성
export function buildProjectTree(sessions: CodexSession[]): ProjectTreeNode[] {
  const roots: Map<string, ProjectTreeNode> = new Map();

  for (const sess of sessions) {
    const { root, sub } = cwdToProject(sess.cwd);

    if (!roots.has(root)) {
      roots.set(root, {
        name: root,
        path: root,
        sessionCount: 0,
        children: [],
      });
    }
    const rootNode = roots.get(root)!;

    if (!sub) {
      rootNode.sessionCount += 1;
    } else {
      const existing = rootNode.children.find((c) => c.name === sub);
      if (existing) {
        existing.sessionCount += 1;
      } else {
        rootNode.children.push({
          name: sub,
          path: `${root}/${sub}`,
          sessionCount: 1,
          children: [],
        });
      }
      rootNode.sessionCount += 1;
    }
  }

  return Array.from(roots.values()).sort(
    (a, b) => b.sessionCount - a.sessionCount
  );
}
