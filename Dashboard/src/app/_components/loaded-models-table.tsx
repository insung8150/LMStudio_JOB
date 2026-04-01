"use client";

import { usePolling } from "@/hooks/use-polling";
import { MODEL_POLL_INTERVAL } from "@/lib/constants";
import type { LoadedModel } from "@/lib/types";

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("GENERATING") || s.includes("PROCESSING"))
    return "var(--accent-green)";
  if (s.includes("IDLE")) return "var(--text-muted)";
  return "var(--accent-yellow)";
}

export default function LoadedModelsTable() {
  const { data, loading } = usePolling<{ loaded: LoadedModel[] }>(
    "/api/models/loaded",
    MODEL_POLL_INTERVAL,
    { loaded: [] }
  );

  if (loading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse h-32"
        style={{ background: "var(--bg-card)" }}
      />
    );
  }

  if (data.loaded.length === 0) {
    return (
      <div
        className="rounded-xl p-4 text-center text-sm"
        style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
      >
        로드된 모델이 없습니다
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <th
              className="text-left px-4 py-3 font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Model
            </th>
            <th
              className="text-left px-4 py-3 font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Status
            </th>
            <th
              className="text-right px-4 py-3 font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Size
            </th>
            <th
              className="text-right px-4 py-3 font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Context
            </th>
          </tr>
        </thead>
        <tbody>
          {data.loaded.map((model) => (
            <tr
              key={model.identifier}
              className="border-b last:border-0"
              style={{ borderColor: "var(--border)" }}
            >
              <td className="px-4 py-3 font-mono text-xs">
                {model.identifier}
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    color: statusColor(model.status),
                    background: "var(--bg-primary)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: statusColor(model.status) }}
                  />
                  {model.status}
                </span>
              </td>
              <td
                className="px-4 py-3 text-right text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {model.size}
              </td>
              <td
                className="px-4 py-3 text-right text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {model.context.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
