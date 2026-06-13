import type {
  ModelCallOptions,
  ModelCallResult,
  Provider,
  StatusResponse,
} from "./types";
import { callAnthropic, anthropicConfigured } from "./anthropic";
import { callOllama, getOllamaInfo, ollamaHost } from "./ollama";
import { mockCall, forcedDemo } from "./demo";

/**
 * Single entry point for every model call. Routes pass options; this dispatches
 * to the chosen provider. PROMPT_EVAL_DEMO forces simulated output regardless.
 */
export async function callModel(opts: ModelCallOptions): Promise<ModelCallResult> {
  if (forcedDemo()) return mockCall(opts);
  switch (opts.settings.provider) {
    case "demo":
      return mockCall(opts);
    case "anthropic":
      return callAnthropic(opts);
    case "ollama":
    default:
      return callOllama(opts);
  }
}

/** Reports which providers are usable right now, so the UI can guide the user. */
export async function getStatus(): Promise<StatusResponse> {
  const forced = forcedDemo();
  const ollama = await getOllamaInfo();
  const anthropic = anthropicConfigured();

  const defaultProvider: Provider = forced
    ? "demo"
    : ollama.reachable
      ? "ollama"
      : anthropic
        ? "anthropic"
        : "demo";

  return {
    providers: {
      ollama: {
        available: ollama.reachable,
        models: ollama.models,
        note: ollama.reachable
          ? ollama.models.length
            ? undefined
            : "Reachable, but no models pulled yet. Run e.g. 'ollama pull llama3.2'."
          : "Not detected. Install Ollama (ollama.com), start it, and pull a model.",
      },
      anthropic: {
        available: anthropic && !forced,
        models: anthropic
          ? ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"]
          : [],
        note: anthropic ? undefined : "Set ANTHROPIC_API_KEY to enable Claude.",
      },
      demo: {
        available: true,
        models: [],
        note: forced
          ? "Forced on via PROMPT_EVAL_DEMO."
          : "Simulated outputs — no setup, not real model responses.",
      },
    },
    defaultProvider,
    ollamaHost: ollamaHost(),
  };
}
