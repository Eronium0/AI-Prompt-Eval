import { NextResponse } from "next/server";
import { callModel } from "@/lib/anthropic";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { JudgeRequest, JudgeResponse, ApiError } from "@/lib/types";

export const maxDuration = 60;
export const runtime = "nodejs";

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    rankings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          variantId: { type: "string" },
          score: { type: "integer" },
          rationale: { type: "string" },
        },
        required: ["variantId", "score", "rationale"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" },
  },
  required: ["rankings", "summary"],
  additionalProperties: false,
} as const;

export async function POST(
  req: Request
): Promise<NextResponse<JudgeResponse | ApiError>> {
  let body: JudgeRequest;
  try {
    body = (await req.json()) as JudgeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { task, rubric, items } = body;
  if (!items?.length) {
    return NextResponse.json(
      { error: "No outputs to judge." },
      { status: 400 }
    );
  }

  const rendered = items
    .map(
      (it) =>
        `### Variant id: ${it.variantId} (label: ${it.label})\nPrompt used:\n${it.prompt}\n\nOutput:\n${it.output}`
    )
    .join("\n\n----------------\n\n");

  const instruction = `You are an impartial evaluator scoring LLM outputs for a prompt-engineering study. Be calibrated and critical — do not give everything a high score.

Task: ${task.name || "(untitled)"}
Goal / what good output looks like: ${task.description || "(not specified)"}
${task.input.trim() ? `Fixed input the outputs were produced from:\n${task.input}\n` : ""}
Scoring rubric (apply strictly): ${rubric || "Overall quality: accuracy, relevance to the goal, clarity, and adherence to any implied constraints."}

Score each output from 0 to 100 against the rubric. Use the exact variantId given. Then write a 2-4 sentence summary explaining how prompt specificity related to output quality across the variants.

The outputs:

${rendered}`;

  try {
    const { output } = await callModel({
      settings: { ...DEFAULT_SETTINGS, maxTokens: 4000, effort: "high" },
      userMessage: instruction,
      jsonSchema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
    });

    const parsed = JSON.parse(output) as JudgeResponse;
    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
