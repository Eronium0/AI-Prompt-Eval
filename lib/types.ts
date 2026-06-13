// Shared types used by both the API routes (server) and the UI (client).

export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

/** Run-time knobs the user can tune, held constant across all variants in a run. */
export interface RunSettings {
  model: string;
  effort: Effort;
  maxTokens: number;
  /** When true, use adaptive thinking; when false, disable it for faster/cleaner output. */
  thinking: boolean;
}

export const DEFAULT_SETTINGS: RunSettings = {
  model: "claude-opus-4-8",
  effort: "medium",
  maxTokens: 2048,
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

/** Result of running one variant. `error`/`refusal` are mutually exclusive with `output`. */
export interface RunResult {
  output: string;
  metrics: RunMetrics;
  stopReason: string | null;
  refusal: boolean;
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
