import { spawn, type ChildProcess } from "child_process";
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { LMS_CLI_PATH } from "./constants";

const LOGS_DIR = join(process.cwd(), "api-logs");
let collectorProcess: ChildProcess | null = null;
let isRunning = false;

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(LOGS_DIR, `${date}.jsonl`);
}

export function startCollector(): void {
  if (isRunning) return;

  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }

  collectorProcess = spawn(LMS_CLI_PATH, ["log", "stream", "--json"], {
    stdio: ["ignore", "pipe", "ignore"],
  });

  let buffer = "";

  collectorProcess.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("Streaming")) continue;
      try {
        JSON.parse(trimmed); // validate
        appendFileSync(getLogFilePath(), trimmed + "\n");
      } catch {
        // skip
      }
    }
  });

  collectorProcess.on("close", () => {
    isRunning = false;
    // 자동 재시작 (5초 후)
    setTimeout(() => startCollector(), 5000);
  });

  isRunning = true;
}

export interface ApiConversation {
  id: number;
  timestamp: number;
  model: string;
  input: string;
  output: string;
  stats?: {
    tokensPerSecond?: number;
    totalTimeSec?: number;
    promptTokensCount?: number;
    predictedTokensCount?: number;
    totalTokensCount?: number;
  };
}

export function getApiConversations(
  date?: string,
  limit: number = 100
): ApiConversation[] {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const filepath = join(LOGS_DIR, `${targetDate}.jsonl`);

  if (!existsSync(filepath)) return [];

  const raw = readFileSync(filepath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);

  const conversations: ApiConversation[] = [];
  let pendingInput: { timestamp: number; model: string; input: string } | null =
    null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const data = entry.data;
      if (!data) continue;

      if (data.type === "llm.prediction.input") {
        pendingInput = {
          timestamp: entry.timestamp,
          model: data.modelIdentifier || "unknown",
          input: data.input || "",
        };
      } else if (data.type === "llm.prediction.output" && pendingInput) {
        conversations.push({
          id: conversations.length,
          timestamp: pendingInput.timestamp,
          model: data.modelIdentifier || pendingInput.model,
          input: pendingInput.input,
          output: data.output || "",
          stats: data.stats
            ? {
                tokensPerSecond: data.stats.tokensPerSecond,
                totalTimeSec: data.stats.totalTimeSec,
                promptTokensCount: data.stats.promptTokensCount,
                predictedTokensCount: data.stats.predictedTokensCount,
                totalTokensCount: data.stats.totalTokensCount,
              }
            : undefined,
        });
        pendingInput = null;
      }
    } catch {
      // skip
    }
  }

  return conversations.slice(-limit).reverse();
}

export function getAvailableDates(): string[] {
  if (!existsSync(LOGS_DIR)) return [];
  const { readdirSync } = require("fs");
  return readdirSync(LOGS_DIR)
    .filter((f: string) => f.endsWith(".jsonl"))
    .map((f: string) => f.replace(".jsonl", ""))
    .sort()
    .reverse();
}
