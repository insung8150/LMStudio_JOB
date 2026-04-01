import { execSync } from "child_process";
import { LM_STUDIO_URL, LMS_CLI_PATH } from "./constants";
import type { DetailedModel, LoadedModel } from "./types";

export async function fetchModels(): Promise<DetailedModel[]> {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/api/v1/models`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || data || [];
  } catch {
    return [];
  }
}

export function fetchLoadedModels(): LoadedModel[] {
  try {
    const output = execSync(`${LMS_CLI_PATH} ps`, {
      encoding: "utf-8",
      timeout: 5000,
    });

    const lines = output.trim().split("\n");
    // 헤더 라인 이후부터 파싱
    const headerIdx = lines.findIndex((l) => l.includes("IDENTIFIER"));
    if (headerIdx === -1) return [];

    return lines
      .slice(headerIdx + 1)
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s{2,}/);
        return {
          identifier: parts[0] || "",
          model: parts[1] || "",
          status: parts[2] || "",
          size: parts[3] || "",
          context: parseInt(parts[4]) || 0,
          ttl: parts[5] || "",
        };
      });
  } catch {
    return [];
  }
}

export async function checkServerStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/models`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
