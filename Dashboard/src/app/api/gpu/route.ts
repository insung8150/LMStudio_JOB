import { NextResponse } from "next/server";
import { fetchGpuInfo } from "@/lib/gpu-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const gpus = fetchGpuInfo();
  return NextResponse.json({ gpus, timestamp: Date.now() });
}
