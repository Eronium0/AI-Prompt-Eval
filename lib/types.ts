// Shared types used by both the API routes (server) and the UI (client).

/**
 * Where model calls go:
 * - "ollama"    — a local model runtime (real outputs, free, no key; needs Ollama running)
 * - "anthropic" — Claude via the Anthropic API (real outputs, needs ANTHROPIC_API_KEY)
 * - "demo"      — simulated outputs (no setup, not real — for trying the UI)
 */
export type Provider = "ollama" | "anthropic" | "demo";

export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

/** Run-time knobs held constant across all variants in a run. */
export interface RunSettings {
  provider: Provider;
  model: string;
  maxTokens: number;
  /** Anthropic-only: effort level. Ignored by other providers. */
  effort: Effort;
  /** Anthropic-only: adaptive thinking on/off. Ignored by other providers. */
  thinking: boolean;
}

export function defaultModelFor(p: Provider): string {
  if (p === "anthropic") return "claude-opus-4-8";
  if (p === "ollama") return "llama3.2";
  return "demo";
}

export const DEFAULT_SETTINGS: RunSettings = {
  provider: "ollama",
  model: defaultModelFor("ollama"),
  maxTokens: 2048,
  effort: "medium",
  thinking: true,
};

/** A single prompt of a given specificity. The unit being compared. */
export interface Variant {
  id: string;
  label: string;
  prompt: string;
}

/** The constant context a task operates on — held identical across every variant. */
export interface Task {
  name: string;
  /** What "good" looks like — feeds variant generation and the judge. */
  description: string;
  /** Optional fixed input/content all prompts operate on (e.g. an article to summarize). */
  input: string;
}

export interface RunMetrics {
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  charCount: number;
  wordCount: number;
}

/** Result of running one variant. */
export interface RunResult {
  output: string;
  metrics: RunMetrics;
  stopReason: string | null;
  refusal: boolean;
}

// ---- Internal model-call shapes (server) ----

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

// ---- API request/response shapes ----

export interface RunRequest {
  prompt: string;
  task: Task;
  settings: RunSettings;
}

export interface GenerateVariantsRequest {
  task: Task;
  basePrompt: string;
  /** How many specificity levels to produce. */
  count: number;
  settings: RunSettings;
}

export interface GeneratedVariant {
  label: string;
  prompt: string;
}

export interface GenerateVariantsResponse {
  variants: GeneratedVariant[];
}

export interface JudgeRequestItem {
  variantId: string;
  label: string;
  prompt: string;
  output: string;
}

export interface JudgeRequest {
  task: Task;
  rubric: string;
  items: JudgeRequestItem[];
  settings: RunSettings;
}

export interface JudgeScore {
  variantId: string;
  /** 0-100. */
  score: number;
  rationale: string;
}

export interface JudgeResponse {
  rankings: JudgeScore[];
  summary: string;
}

export interface ApiError {
  error: string;
}

// ---- Status (which providers are usable right now) ----

export interface ProviderInfo {
  available: boolean;
  /** Selectable model names (pulled Ollama models, or suggested Claude models). */
  models: string[];
  /** Human-readable hint when unavailable or partially set up. */
  note?: string;
}

export interface StatusResponse {
  providers: Record<Provider, ProviderInfo>;
  defaultProvider: Provider;
  ollamaHost: string;
}
