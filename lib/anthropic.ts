import Anthropic from "@anthropic-ai/sdk";
import type { RunSettings, Task } from "./types";

/**
 * Centralized Anthropic access + model config. Every server route goes through
 * here so the model, thinking, and effort policy live in one place.
 *
 * Defaults follow Anthropic's current guidance: claude-opus-4-8, adaptive
 * thinking, and streaming (so large/slow responses don't trip request timeouts).
 */

let client: Anthropic | null = null;

/**
 * Demo mode: serve simulated outputs so the UI is fully explorable for free.
 * Active when either no API key is configured, or PROMPT_EVAL_DEMO is set
 * (a manual switch — useful when a key exists but you don't want real billed
 * calls, e.g. a key with no credits). With a working key and the flag unset,
 * every call goes to the real model.
 */
export function isDemoMode(): boolean {
  const forced = /^(1|true|yes)$/i.test(process.env.PROMPT_EVAL_DEMO ?? "");
  return forced || !process.env.ANTHROPIC_API_KEY;
}

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key."
    );
  }
  // The SDK reads ANTHROPIC_API_KEY from the environment automatically.
  if (!client) client = new Anthropic();
  return client;
}

/** Count words the same way everywhere so metrics are comparable across variants. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Build the user message for a run: the variant prompt, plus the task's shared
 * input appended underneath a divider when present. Keeping the input identical
 * across variants is what makes the comparison fair.
 */
export function buildUserMessage(prompt: string, task: Task): string {
  if (task.input.trim()) {
    return `${prompt}\n\n---\n${task.input}`;
  }
  return prompt;
}

/**
 * Shared request shape for a model call. We stream and resolve the final message
 * so usage is captured and we stay under SDK/serverless timeouts on long output.
 *
 * `output_config` (effort + optional structured-output format) isn't always in
 * the installed SDK's static types yet, so params are assembled loosely here.
 */
export interface ModelCallOptions {
  settings: RunSettings;
  system?: string;
  userMessage: string;
  /** Optional JSON schema to constrain the response (used by generate + judge). */
  jsonSchema?: Record<string, unknown>;
}

export interface ModelCallResult {
  output: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number } | null;
}

export async function callModel(opts: ModelCallOptions): Promise<ModelCallResult> {
  if (isDemoMode()) return mockCall(opts);

  const { settings, system, userMessage, jsonSchema } = opts;

  const params: Record<string, unknown> = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    messages: [{ role: "user", content: userMessage }],
    thinking: settings.thinking
      ? { type: "adaptive" }
      : { type: "disabled" },
    output_config: { effort: settings.effort },
  };

  if (system) params.system = system;
  if (jsonSchema) {
    (params.output_config as Record<string, unknown>).format = {
      type: "json_schema",
      schema: jsonSchema,
    };
  }

  const client = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = client.messages.stream(params as any);
  const message = await stream.finalMessage();

  const output = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    output,
    stopReason: message.stop_reason ?? null,
    usage: message.usage
      ? {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Demo mode — deterministic, simulated outputs (no API key required).
//
// These do NOT call any model. They produce believable, format-aware text so a
// visitor can see how the app works — and, crucially, so the research point is
// still visible: more specific prompts yield tighter, more controlled output.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const estTokens = (s: string) => Math.max(1, Math.round(s.length / 4));

function hasProp(schema: Record<string, unknown>, key: string): boolean {
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  return !!props && key in props;
}

function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

function firstNumber(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

const ensurePeriod = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const stripTrailingPeriod = (s: string) => s.replace(/[.\s]+$/, "");
function trimWords(s: string, max: number): string {
  const w = s.split(/\s+/);
  return w.length <= max ? s : w.slice(0, max).join(" ");
}

function mockRunOutput(userMessage: string): string {
  const [instruction, ...rest] = userMessage.split("\n\n---\n");
  const input = rest.join("\n").trim();
  const lc = (instruction ?? "").toLowerCase();

  let items = clauses(input || instruction || "");
  if (items.length === 0) items = ["No input was provided to work from."];

  const wantsBullets = /bullet|\blist\b|points?\b/.test(lc);
  const wantsSentences = /sentence/.test(lc);
  const constrained =
    wantsBullets || wantsSentences || /\bword|exactly|max\b|concise|brief/.test(lc);
  const n = firstNumber(instruction ?? "") ?? 3;

  if (wantsBullets) {
    return items
      .slice(0, n)
      .map((s) => `- ${trimWords(stripTrailingPeriod(s), 14)}`)
      .join("\n");
  }
  if (constrained) {
    return items.slice(0, n).map(ensurePeriod).join(" ");
  }
  // Bare/loose prompt → a fuller, less controlled response (the contrast).
  const body = items
    .slice(0, Math.max(4, n + 1))
    .map(ensurePeriod)
    .join(" ");
  return `Sure — here's a rundown. ${body} In short, those are the main points worth noting.`;
}

function mockVariants(userMessage: string): string {
  const n = firstNumber(userMessage.match(/exactly (\d+)/)?.[1] ?? "") ?? 4;
  const taskName = (userMessage.match(/Task name:\s*(.+)/)?.[1] ?? "the task").trim();
  const rawBase = (userMessage.match(/Base prompt idea:\s*(.+)/)?.[1] ?? "").trim();
  const core =
    rawBase && !rawBase.startsWith("(")
      ? stripTrailingPeriod(rawBase)
      : `Complete ${stripTrailingPeriod(taskName)}`;

  const ladder = [
    { label: "Bare", prompt: `${core}.` },
    { label: "Light detail", prompt: `${core}. Keep it clear and concise.` },
    {
      label: "Detailed",
      prompt: `${core}. Use a structured format, lead with the most important point, and keep a neutral tone.`,
    },
    {
      label: "Highly constrained",
      prompt: `${core}. Respond in exactly 3 items, max 12 words each, ordered by importance. Plain text, no filler, no emoji.`,
    },
    {
      label: "Constrained + example",
      prompt: `${core}. Exactly 3 items, max 12 words each, ordered by importance. Match this style: "- Faster cold starts (40%)". Plain text only.`,
    },
    {
      label: "Exhaustive spec",
      prompt: `${core}. Output: exactly 3 bullets; each ≤12 words; ordered by impact (highest first); no marketing language; no emoji; no preamble.`,
    },
  ];
  const count = Math.min(Math.max(n, 2), ladder.length);
  return JSON.stringify({ variants: ladder.slice(0, count) });
}

function mockJudge(userMessage: string): string {
  const re = /Variant id:\s*(\S+)\s*\(label:\s*([^)]*)\)/g;
  const found: { variantId: string; label: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(userMessage)) !== null) {
    found.push({ variantId: m[1], label: m[2].trim() });
  }
  const total = Math.max(1, found.length);
  const rankings = found.map((f, i) => {
    // Later (typically more specific) variants score a little higher.
    const score = Math.max(0, Math.min(100, 55 + Math.round((i / Math.max(1, total - 1)) * 35)));
    const isBest = i === total - 1;
    return {
      variantId: f.variantId,
      score,
      rationale: `(Demo) The "${f.label || "variant"}" prompt produced output ${
        isBest
          ? "that best matched the goal and constraints."
          : "that was reasonable but less tightly controlled than more specific prompts."
      }`,
    };
  });
  const summary =
    "(Demo) Simulated scoring: in this illustrative run, more specific prompts tended to score higher because they constrained format and length. Set ANTHROPIC_API_KEY on the server for real judgments.";
  return JSON.stringify({ rankings, summary });
}

async function mockCall(opts: ModelCallOptions): Promise<ModelCallResult> {
  const { userMessage, jsonSchema } = opts;
  let output: string;
  if (jsonSchema && hasProp(jsonSchema, "variants")) {
    output = mockVariants(userMessage);
  } else if (jsonSchema && hasProp(jsonSchema, "rankings")) {
    output = mockJudge(userMessage);
  } else {
    output = mockRunOutput(userMessage);
  }
  // Small, output-proportional delay so the loading state shows and latencies vary.
  await sleep(250 + Math.min(700, output.length));
  return {
    output,
    stopReason: "end_turn",
    usage: { input_tokens: estTokens(userMessage), output_tokens: estTokens(output) },
  };
}
