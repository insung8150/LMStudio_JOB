import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { SERVER_LOGS_DIR } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const months = readdirSync(SERVER_LOGS_DIR)
      .filter((d) => {
        try {
          return statSync(join(SERVER_LOGS_DIR, d)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort()
      .reverse();

    const result = months.map((month) => {
      const monthDir = join(SERVER_LOGS_DIR, month);
      const files = readdirSync(monthDir)
        .filter((f) => f.endsWith(".log"))
        .sort()
        .reverse();

      return {
        month,
        files: files.map((f) => ({
          name: f,
          size: statSync(join(monthDir, f)).size,
        })),
      };
    });

    return NextResponse.json({ logGroups: result });
  } catch {
    return NextResponse.json({ logGroups: [] });
  }
}
