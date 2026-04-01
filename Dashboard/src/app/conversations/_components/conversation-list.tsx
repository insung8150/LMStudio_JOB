"use client";

import { useState } from "react";
import Link from "next/link";
import { usePolling } from "@/hooks/use-polling";
import { CONVERSATION_POLL_INTERVAL } from "@/lib/constants";
import { formatDate, truncate } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/types";

export default function ConversationList() {
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, refresh } = usePolling<{
    conversations: ConversationSummary[];
  }>("/api/conversations", CONVERSATION_POLL_INTERVAL, { conversations: [] });

  const filtered = data.conversations.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.modelName.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(id: string) {
    if (!confirm("이 대화를 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {/* 검색 */}
      <input
        type="text"
        placeholder="Search conversations..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg text-sm mb-4 border outline-none focus:ring-1"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
      />

      {/* 대화 목록 */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {filtered.length === 0 ? (
          <div
            className="p-8 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            대화가 없습니다
          </div>
        ) : (
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
                  Name
                </th>
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Model
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Messages
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Tokens
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Date
                </th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((conv) => (
                <tr
                  key={conv.id}
                  className="border-b last:border-0 transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/conversations/${conv.id}`}
                      className="hover:underline"
                      style={{ color: "var(--accent-blue)" }}
                    >
                      {truncate(conv.name, 40)}
                    </Link>
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {truncate(conv.modelName, 30)}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {conv.messageCount}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {conv.tokenCount.toLocaleString()}
                  </td>
                  <td
                    className="px-4 py-3 text-right text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatDate(conv.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(conv.id)}
                      disabled={deletingId === conv.id}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{
                        color: "var(--accent-red)",
                        background: "transparent",
                      }}
                      title="삭제"
                    >
                      {deletingId === conv.id ? "..." : "✕"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
