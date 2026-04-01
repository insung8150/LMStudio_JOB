import { readFileSync, readdirSync, unlinkSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { CONVERSATIONS_DIR } from "./constants";
import type {
  ConversationFile,
  ConversationSummary,
  ContentBlock,
} from "./types";

function extractText(content: ContentBlock[] | string | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

export function listConversations(): ConversationSummary[] {
  try {
    const files = readdirSync(CONVERSATIONS_DIR).filter((f) =>
      f.endsWith(".conversation.json")
    );

    return files
      .map((filename) => {
        try {
          const filepath = join(CONVERSATIONS_DIR, filename);
          const raw = readFileSync(filepath, "utf-8");
          const data: ConversationFile = JSON.parse(raw);
          const id = filename.replace(".conversation.json", "");

          return {
            id,
            name: data.name || "Untitled",
            createdAt: data.createdAt,
            tokenCount: data.tokenCount || 0,
            messageCount: data.messages?.length || 0,
            modelName: data.lastUsedModel?.identifier || "unknown",
            systemPromptPreview: (data.systemPrompt || "").slice(0, 100),
          };
        } catch {
          return null;
        }
      })
      .filter((s): s is ConversationSummary => s !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function getConversation(id: string): ConversationFile | null {
  try {
    const filepath = join(CONVERSATIONS_DIR, `${id}.conversation.json`);
    const raw = readFileSync(filepath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteConversation(id: string): boolean {
  try {
    const filepath = join(CONVERSATIONS_DIR, `${id}.conversation.json`);
    const trashDir = join(CONVERSATIONS_DIR, ".trash");
    try {
      mkdirSync(trashDir, { recursive: true });
      renameSync(filepath, join(trashDir, `${id}.conversation.json`));
    } catch {
      unlinkSync(filepath);
    }
    return true;
  } catch {
    return false;
  }
}

// 대화 메시지를 표시용으로 평탄화
export function flattenMessages(
  conv: ConversationFile
): { role: string; text: string; model?: string; stats?: Record<string, unknown> }[] {
  const result: { role: string; text: string; model?: string; stats?: Record<string, unknown> }[] = [];

  for (const msg of conv.messages) {
    const ver = msg.versions[msg.currentlySelected];
    if (!ver) continue;

    if (ver.type === "singleStep") {
      result.push({
        role: ver.role,
        text: extractText(ver.content),
      });
    } else if (ver.type === "multiStep" && ver.steps) {
      const texts: string[] = [];
      let stats: Record<string, unknown> | undefined;
      let model: string | undefined;

      for (const step of ver.steps) {
        if (step.type === "contentBlock" && step.content) {
          texts.push(extractText(step.content));
        }
        if (step.genInfo?.stats) {
          stats = step.genInfo.stats as unknown as Record<string, unknown>;
        }
        if (step.genInfo?.identifier) {
          model = step.genInfo.identifier;
        }
      }

      if (texts.length > 0) {
        result.push({
          role: ver.role,
          text: texts.join("\n"),
          model: model || ver.senderInfo?.senderName,
          stats,
        });
      }
    }
  }

  return result;
}
