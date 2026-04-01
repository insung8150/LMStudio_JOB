"use client";

import { usePolling } from "@/hooks/use-polling";
import { GPU_POLL_INTERVAL } from "@/lib/constants";
import type { GpuInfo } from "@/lib/types";
import type { LoadedModel } from "@/lib/types";
import type { ConversationSummary } from "@/lib/types";

export default function SystemSummary() {
  const { data: gpuData } = usePolling<{ gpus: GpuInfo[] }>(
    "/api/gpu",
    GPU_POLL_INTERVAL,
    { gpus: [] }
  );
  const { data: modelData } = usePolling<{ loaded: LoadedModel[] }>(
    "/api/models/loaded",
    10000,
    { loaded: [] }
  );
  const { data: convData } = usePolling<{ conversations: ConversationSummary[] }>(
    "/api/conversations",
    30000,
    { conversations: [] }
  );

  const totalVramUsed = gpuData.gpus.reduce(
    (sum, g) => sum + g.memoryUsedMiB,
    0
  );
  const totalVramTotal = gpuData.gpus.reduce(
    (sum, g) => sum + g.memoryTotalMiB,
    0
  );

  const cards = [
    {
      label: "GPUs",
      value: `${gpuData.gpus.length}`,
      sub: `${Math.round(totalVramUsed / 1024)}G / ${Math.round(totalVramTotal / 1024)}G VRAM`,
      color: "var(--accent-blue)",
    },
    {
      label: "Active Models",
      value: `${modelData.loaded.length}`,
      sub: modelData.loaded.map((m) => m.identifier).join(", ") || "None",
      color: "var(--accent-green)",
    },
    {
      label: "Conversations",
      value: `${convData.conversations.length}`,
      sub: "saved chats",
      color: "var(--accent-purple)",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl p-4 border"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
          }}
        >
          <p
            className="text-xs font-medium mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            {card.label}
          </p>
          <p className="text-2xl font-bold" style={{ color: card.color }}>
            {card.value}
          </p>
          <p
            className="text-xs mt-1 truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
