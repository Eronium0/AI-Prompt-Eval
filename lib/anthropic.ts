import Anthropic from "@anthropic-ai/sdk";
import type { ModelCallOptions, ModelCallResult } from "./types";

/**
 * Anthropic (Claude) provider. Real outputs via the Anthropic API; needs
 * ANTHROPIC_API_KEY. Defaults follow current guidance: adaptive thinking and
 * streaming (so large/slow responses don't trip request timeouts). Effort and
 * thinking come from RunSettings.
 */

let client: Anthropic | null = null;

export function anthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key, or use the Ollama (local) / Demo provider."
    );
  }
  // The SDK reads ANTHROPIC_API_KEY from the environment automatically.
  if (!client) client = new Anthropic();
  return client;
}

export async function callAnthropic(opts: ModelCallOptions): Promise<ModelCallResult> {
  const { settings, system, userMessage, jsonSchema } = opts;

  // `output_config` (effort + structured-output format) isn't always in the
  // installed SDK's static types yet, so params are assembled loosely here.
  const params: Record<string, unknown> = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    messages: [{ role: "user", content: userMessage }],
    thinking: settings.thinking ? { type: "adaptive" } : { type: "disabled" },
    output_config: { effort: settings.effort },
  };

  if (system) params.system = system;
  if (jsonSchema) {
    (params.output_config as Record<string, unknown>).format = {
      type: "json_schema",
      schema: jsonSchema,
    };
  }

  const c = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = c.messages.stream(params as any);
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
