"use client";

import ApiConversationList from "./_components/api-conversation-list";

export default function ApiConversationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">API Conversations</h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          LM Studio API를 통한 대화 기록 (Paperclip 에이전트 등)
        </p>
      </div>
      <ApiConversationList />
    </div>
  );
}
