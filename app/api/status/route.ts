import { NextResponse } from "next/server";
import { getStatus } from "@/lib/model";
import type { StatusResponse } from "@/lib/types";

export const runtime = "nodejs";
// Probes the local Ollama server each call, so don't cache.
export const dynamic = "force-dynamic";

// Tells the client which providers are usable right now (Ollama reachable?
// which models are pulled? is a Claude key set?) — without exposing any secret.
export async function GET(): Promise<NextResponse<StatusResponse>> {
  return NextResponse.json(await getStatus());
}
