import { LMS_CLI_PATH } from "@/lib/constants";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const child = spawn(LMS_CLI_PATH, ["log", "stream", "--json"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";

      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("Streaming")) continue;
          try {
            JSON.parse(trimmed); // validate
            controller.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
          } catch {
            // skip non-JSON lines
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (msg && !msg.includes("Streaming logs")) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: msg })}\n\n`
            )
          );
        }
      });

      child.on("close", () => {
        controller.close();
      });

      child.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err.message })}\n\n`
          )
        );
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
