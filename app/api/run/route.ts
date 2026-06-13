import { NextResponse } from "next/server";
import { callModel } from "@/lib/model";
import { buildUserMessage, wordCount } from "@/lib/util";
import type { RunRequest, RunResult, ApiError } from "@/lib/types";

// Claude calls can run longer than the default serverless limit; ask for more.
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(
  req: Request
): Promise<NextResponse<RunResult | ApiError>> {
  let body: RunRequest;
  try {
    body = (await req.json()) as RunRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { prompt, task, settings } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is empty." }, { status: 400 });
  }

  // With thinking off, Opus 4.8 can leak reasoning into the answer; nudge it to
  // return only the final answer so outputs stay clean and comparable.
  const system = settings.thinking
    ? undefined
    : "Respond with only your final answer. Do not include exploratory reasoning, planning, or meta-commentary about your process.";

  try {
    const start = Date.now();
    const { output, stopReason, usage } = await callModel({
      settings,
      system,
      userMessage: buildUserMessage(prompt, task),
    });
    const latencyMs = Date.now() - start;

    const result: RunResult = {
      output,
      stopReason,
      refusal: stopReason === "refusal",
      metrics: {
        latencyMs,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        charCount: output.length,
        wordCount: wordCount(output),
      },
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
