import { NextResponse } from "next/server";
import { fetchModels } from "@/lib/lmstudio-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const models = await fetchModels();
  return NextResponse.json({ models });
}
