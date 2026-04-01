import { NextResponse } from "next/server";
import { fetchLoadedModels } from "@/lib/lmstudio-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const loaded = fetchLoadedModels();
  return NextResponse.json({ loaded });
}
