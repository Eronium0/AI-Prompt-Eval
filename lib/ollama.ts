import type { ModelCallOptions, ModelCallResult } from "./types";

/**
 * Local model provider via Ollama (https://ollama.com). Real outputs, free, no
 * API key — the app talks to a model running on the user's own machine. This is
 * the "accessible for all" path: install Ollama, `ollama pull <model>`, run.
 *
 * Ollama's HTTP API: GET /api/tags (list models), POST /api/chat (generate).
 */

export function ollamaHost(): string {
  return (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/+$/, "");
}

/** Probe the local Ollama server. Never throws — returns reachability + models. */
export async function getOllamaInfo(): Promise<{ reachable: boolean; models: string[] }> {
  try {
    const res = await fetch(`${ollamaHost()}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { reachable: false, models: [] };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { reachable: true, models: (data.models ?? []).map((m) => m.name) };
  } catch {
    return { reachable: false, models: [] };
  }
}

export async function callOllama(opts: ModelCallOptions): Promise<ModelCallResult> {
  const { settings, system, userMessage, jsonSchema } = opts;

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userMessage });

  const body: Record<string, unknown> = {
    model: settings.model,
    messages,
    stream: false,
    options: { num_predict: settings.maxTokens },
  };
  // Ollama structured outputs: pass a JSON schema as `format`.
  if (jsonSchema) body.format = jsonSchema;

  let res: Response;
  try {
    res = await fetch(`${ollamaHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Could not reach Ollama at ${ollamaHost()}. Is it running? Install from ollama.com, then 'ollama pull ${settings.model}'.`
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error(
        `Ollama has no model named "${settings.model}". Pull it first: 'ollama pull ${settings.model}'.`
      );
    }
    throw new Error(`Ollama error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    message?: { content?: string };
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    output: data.message?.content ?? "",
    stopReason: data.done_reason ?? "stop",
    usage: {
      input_tokens: data.prompt_eval_count ?? 0,
      output_tokens: data.eval_count ?? 0,
    },
  };
}
