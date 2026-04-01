"use client";

import { usePolling } from "@/hooks/use-polling";
import { GPU_POLL_INTERVAL } from "@/lib/constants";
import type { GpuInfo } from "@/lib/types";

function tempColor(temp: number): string {
  if (temp >= 80) return "var(--accent-red)";
  if (temp >= 60) return "var(--accent-yellow)";
  return "var(--accent-green)";
}

function usageColor(pct: number): string {
  if (pct >= 90) return "var(--accent-red)";
  if (pct >= 70) return "var(--accent-yellow)";
  return "var(--accent-blue)";
}

export default function GpuCards() {
  const { data, loading } = usePolling<{ gpus: GpuInfo[] }>(
    "/api/gpu",
    GPU_POLL_INTERVAL,
    { gpus: [] }
  );

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 animate-pulse h-36"
            style={{ background: "var(--bg-card)" }}
          />
        ))}
      </div>
    );
  }

  if (data.gpus.length === 0) {
    return (
      <div
        className="rounded-xl p-4 text-center text-sm"
        style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
      >
        GPU 정보를 가져올 수 없습니다
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
      {data.gpus.map((gpu) => {
        const memPct = Math.round(
          (gpu.memoryUsedMiB / gpu.memoryTotalMiB) * 100
        );
        return (
          <div
            key={gpu.index}
            className="rounded-xl p-4 border"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                GPU {gpu.index}
              </span>
              <span
                className="text-xs font-bold"
                style={{ color: tempColor(gpu.temperatureC) }}
              >
                {gpu.temperatureC}°C
              </span>
            </div>

            <p
              className="text-xs mb-3 truncate"
              style={{ color: "var(--text-muted)" }}
              title={gpu.name}
            >
              {gpu.name}
            </p>

            {/* VRAM 바 */}
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: "var(--text-secondary)" }}>VRAM</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {Math.round(gpu.memoryUsedMiB / 1024)}G /{" "}
                  {Math.round(gpu.memoryTotalMiB / 1024)}G
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--bg-primary)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${memPct}%`,
                    background: usageColor(memPct),
                  }}
                />
              </div>
            </div>

            {/* GPU 사용률 */}
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--text-muted)" }}>Util</span>
              <span style={{ color: usageColor(gpu.utilizationPercent) }}>
                {gpu.utilizationPercent}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
