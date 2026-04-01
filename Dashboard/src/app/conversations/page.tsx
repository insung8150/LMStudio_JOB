"use client";

import ConversationList from "./_components/conversation-list";

export default function ConversationsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Conversations</h2>
      <ConversationList />
    </div>
  );
}
