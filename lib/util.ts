import type { Task } from "./types";

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
 * Parse JSON that a model returned, tolerating stray prose around it. Local
 * models don't always honor a JSON schema as strictly as the Anthropic API, so
 * fall back to extracting the outermost {...} object.
 */
export function parseJsonLoose<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new Error("The model did not return valid JSON.");
  }
}
