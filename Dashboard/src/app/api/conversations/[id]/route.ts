import { NextResponse } from "next/server";
import {
  getConversation,
  deleteConversation,
  flattenMessages,
} from "@/lib/conversation-client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conv = getConversation(id);
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = flattenMessages(conv);
  return NextResponse.json({
    id,
    name: conv.name,
    createdAt: conv.createdAt,
    tokenCount: conv.tokenCount,
    systemPrompt: conv.systemPrompt,
    modelName: conv.lastUsedModel?.identifier || "unknown",
    messages,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const success = deleteConversation(id);
  if (!success) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
