import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const LOGS_DIR = join(process.cwd(), "api-logs");

export interface ApiSession {
  id: string;
  startTime: number;
  endTime: number;
  model: string;
  turnCount: number;
  totalTokens: number;
  lastTokPerSec: number;
  agentLabel: string; // 시스템 프롬프트에서 추출한 에이전트 이름
  turns: ApiTurn[];
}

export interface ApiTurn {
  role: "system" | "developer" | "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  model?: string;
  stats?: {
    tokensPerSecond?: number;
    totalTimeSec?: number;
    predictedTokensCount?: number;
  };
}

interface RawEntry {
  timestamp: number;
  data: {
    type: string;
    input?: string;
    output?: string;
    stats?: Record<string, number>;
    modelIdentifier?: string;
  };
}

// ── 시스템 프롬프트 해시 추출 ──

function extractSystemHash(input: string): string {
  // system 메시지만 추출 (developer는 매번 컨텍스트가 달라지므로 제외)
  const sysMatch = input.match(
    /<\|start\|>system<\|message\|>([\s\S]*?)<\|end\|>/
  );

  if (sysMatch) {
    return createHash("md5").update(sysMatch[1].trim()).digest("hex").slice(0, 12);
  }

  // 태그가 없으면 첫 500자를 해시 (최소한의 식별)
  return createHash("md5").update(input.slice(0, 500)).digest("hex").slice(0, 12);
}

// ── 에이전트 라벨 추출 ──

function extractAgentLabel(input: string): string {
  // "You are 작가." / "You are 편집장." — developer 메시지의 역할 지정
  const roleMatch = input.match(/\nYou are ([^\n.]+)\./);
  if (roleMatch) {
    const role = roleMatch[1].trim();
    // "Claude Code" 같은 일반적인 건 건너뛰기
    if (!role.includes("Claude") && !role.includes("ChatGPT") && role.length < 30) {
      return role;
    }
  }

  // "You are agent UUID (역할)" 패턴
  const agentMatch = input.match(/You are agent [a-f0-9-]+ \(([^)]+)\)/);
  if (agentMatch) return agentMatch[1].trim();

  // CWD에서 워크스페이스 ID 추출
  const cwdMatch = input.match(/CWD: .*\/workspaces\/([a-f0-9-]+)/);
  if (cwdMatch) return `agent-${cwdMatch[1].slice(0, 8)}`;

  // 모델 이름이라도
  const modelMatch = input.match(/model[:\s]+([^\n,]+)/i);
  if (modelMatch) return modelMatch[1].trim().slice(0, 20);

  return "unknown";
}

// ── INPUT을 턴으로 파싱 ──

function parseInputIntoTurns(input: string): ApiTurn[] {
  const turns: ApiTurn[] = [];

  // <|start|> 기준으로 블록 분할
  const blocks = input.split("<|start|>").slice(1);

  for (const block of blocks) {
    const roleEnd = block.indexOf("<|");
    if (roleEnd === -1) continue;
    const rawRole = block.slice(0, roleEnd).trim();

    // content 추출
    let content = "";
    const msgIdx = block.indexOf("<|message|>");
    if (msgIdx !== -1) {
      const afterMsg = block.slice(msgIdx + 11);
      const endIdx = afterMsg.search(/<\|end\|>|<\|call\|>/);
      content = endIdx !== -1 ? afterMsg.slice(0, endIdx).trim() : afterMsg.trim();
    }

    // role 정규화
    let role: ApiTurn["role"] = "user";
    if (rawRole === "system") {
      role = "system";
    } else if (rawRole === "developer") {
      role = "developer";
    } else if (rawRole === "user") {
      role = "user";
    } else if (rawRole.startsWith("assistant") && rawRole.includes("to=functions.")) {
      role = "tool_call";
    } else if (rawRole.startsWith("assistant")) {
      role = "assistant";
    } else if (rawRole.startsWith("functions.")) {
      role = "tool_result";
    }

    if (content) {
      turns.push({ role, content });
    }
  }

  if (turns.length === 0 && input.trim()) {
    turns.push({ role: "user", content: input.trim() });
  }

  return turns;
}

// ── 메인: 세션 파싱 ──

export function getApiSessions(date?: string): ApiSession[] {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const filepath = join(LOGS_DIR, `${targetDate}.jsonl`);

  if (!existsSync(filepath)) return [];

  const raw = readFileSync(filepath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);

  const entries: RawEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip
    }
  }

  const inputs = entries.filter((e) => e.data?.type === "llm.prediction.input");
  const outputs = entries.filter((e) => e.data?.type === "llm.prediction.output");

  if (inputs.length === 0) return [];

  // ── 1단계: 시스템 프롬프트 해시로 에이전트별 그룹 ──

  const agentGroups: Map<string, number[]> = new Map();

  for (let i = 0; i < inputs.length; i++) {
    const content = inputs[i].data.input || "";
    const hash = extractSystemHash(content);

    if (!agentGroups.has(hash)) {
      agentGroups.set(hash, []);
    }
    agentGroups.get(hash)!.push(i);
  }

  // ── 2단계: 각 그룹 안에서 내용 포함 관계로 세션 구분 ──

  const allSessions: {
    indices: number[];
    hash: string;
  }[] = [];

  for (const [hash, indices] of agentGroups) {
    let sessionStart = 0;

    for (let j = 1; j < indices.length; j++) {
      const prevContent = inputs[indices[j - 1]].data.input || "";
      const currContent = inputs[indices[j]].data.input || "";
      const prevTail = prevContent.slice(-500);

      if (!currContent.includes(prevTail)) {
        // 새 세션
        allSessions.push({
          indices: indices.slice(sessionStart, j),
          hash,
        });
        sessionStart = j;
      }
    }
    // 마지막 세션
    allSessions.push({
      indices: indices.slice(sessionStart),
      hash,
    });
  }

  // ── 시작 시간순 정렬 ──

  allSessions.sort(
    (a, b) => inputs[b.indices[0]].timestamp - inputs[a.indices[0]].timestamp
  );

  // ── 3단계: ApiSession 객체 생성 ──

  return allSessions.map((sess, idx) => {
    const lastInputIdx = sess.indices[sess.indices.length - 1];
    const firstInputIdx = sess.indices[0];
    const lastInput = inputs[lastInputIdx];
    const lastContent = lastInput.data.input || "";

    // 마지막 INPUT에서 전체 턴 파싱
    const turns = parseInputIntoTurns(lastContent);

    // 마지막 OUTPUT 추가
    const lastOutputIdx = outputs.findIndex(
      (o) => o.timestamp >= lastInput.timestamp
    );
    if (lastOutputIdx !== -1) {
      const out = outputs[lastOutputIdx];
      turns.push({
        role: "assistant",
        content: out.data.output || "",
        model: out.data.modelIdentifier,
        stats: out.data.stats
          ? {
              tokensPerSecond: out.data.stats.tokensPerSecond,
              totalTimeSec: out.data.stats.totalTimeSec,
              predictedTokensCount: out.data.stats.predictedTokensCount,
            }
          : undefined,
      });
    }

    // 모델명
    const model =
      lastInput.data.modelIdentifier ||
      outputs.find((o) => o.timestamp >= inputs[firstInputIdx].timestamp)
        ?.data.modelIdentifier ||
      "unknown";

    // 에이전트 라벨
    const agentLabel = extractAgentLabel(lastContent);

    // 총 토큰
    let totalTokens = 0;
    let lastTokPerSec = 0;
    for (const i of sess.indices) {
      const matchingOutput = outputs.find(
        (o) => o.timestamp >= inputs[i].timestamp
      );
      if (matchingOutput?.data.stats) {
        totalTokens += matchingOutput.data.stats.totalTokensCount || 0;
        lastTokPerSec = matchingOutput.data.stats.tokensPerSecond || 0;
      }
    }

    return {
      id: `${targetDate}-${idx}`,
      startTime: inputs[firstInputIdx].timestamp,
      endTime: lastInput.timestamp,
      model,
      turnCount: sess.indices.length,
      totalTokens,
      lastTokPerSec,
      agentLabel,
      turns,
    };
  });
}

export function getAvailableSessionDates(): string[] {
  if (!existsSync(LOGS_DIR)) return [];
  return readdirSync(LOGS_DIR)
    .filter((f: string) => f.endsWith(".jsonl"))
    .map((f: string) => f.replace(".jsonl", ""))
    .sort()
    .reverse();
}
