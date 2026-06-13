import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/anthropic";

export const runtime = "nodejs";

// Lets the client show a "demo mode" banner without ever exposing the key.
export async function GET(): Promise<NextResponse<{ demo: boolean }>> {
  return NextResponse.json({ demo: isDemoMode() });
}
