import { execSync } from "child_process";
import type { GpuInfo } from "./types";

export function fetchGpuInfo(): GpuInfo[] {
  try {
    const output = execSync(
      "nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits",
      { encoding: "utf-8", timeout: 5000 }
    );

    return output
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [index, name, memUsed, memTotal, util, temp] = line
          .split(",")
          .map((s) => s.trim());
        return {
          index: parseInt(index),
          name,
          memoryUsedMiB: parseInt(memUsed),
          memoryTotalMiB: parseInt(memTotal),
          utilizationPercent: parseInt(util),
          temperatureC: parseInt(temp),
        };
      });
  } catch {
    return [];
  }
}
