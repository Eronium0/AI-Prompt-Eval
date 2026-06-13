import { NextResponse } from "next/server";
import { callModel } from "@/lib/model";
import { parseJsonLoose } from "@/lib/util";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type {
  GenerateVariantsRequest,
  GenerateVariantsResponse,
  ApiError,
} from "@/lib/types";

export const maxDuration = 60;
export const runtime = "nodejs";

const VARIANTS_SCHEMA = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["label", "prompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["variants"],
  additionalProperties: false,
} as const;

export async function POST(
  req: Request
): Promise<NextResponse<GenerateVariantsResponse | ApiError>> {
  let body: GenerateVariantsRequest;
  try {
    body = (await req.json()) as GenerateVariantsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { task, basePrompt, count } = body;
  const settings = body.settings ?? DEFAULT_SETTINGS;
  const n = Math.min(Math.max(count || 4, 2), 6);

  const instruction = `You are helping a researcher study how prompt specificity affects an LLM's output.

Task name: ${task.name || "(untitled)"}
What good output looks like: ${task.description || "(not specified)"}
${task.input.trim() ? `The prompts will operate on this fixed input:\n${task.input}\n` : ""}
Base prompt idea: ${basePrompt || "(none — invent a reasonable one for the task)"}

Produce exactly ${n} prompt variants for this task, ordered from LEAST specific to MOST specific. Each step should add concrete detail, constraints, format requirements, tone, or examples — so the researcher can see how added specificity changes the result. Do NOT include the fixed input inside the prompts; write only the instruction portion. Give each a short label describing its specificity level (e.g. "Bare", "Light detail", "Detailed", "Highly constrained").`;

  try {
    const { output } = await callModel({
      settings: { ...settings, maxTokens: Math.max(settings.maxTokens, 2048) },
      userMessage: instruction,
      jsonSchema: VARIANTS_SCHEMA as unknown as Record<string, unknown>,
    });

    const parsed = parseJsonLoose<GenerateVariantsResponse>(output);
    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
