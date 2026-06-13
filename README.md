# AI-Prompt-Eval

A prompt evaluation app, for the sole purpose of research into the effects certain changes in prompts have on the same outcome.

You define a **task**, enter several **prompt variants** of varying specificity and detail, run them all against the same model under identical settings, and compare the outputs side-by-side — with per-run metrics and an optional LLM-as-judge score.

## What it does

- **Define a task** — a name, a description of what good output looks like, and an optional fixed input that's held constant across every variant.
- **Write prompt variants by hand**, or **auto-generate** a ladder of specificity levels (least → most specific) to see the axis before writing your own.
- **Run all variants** against the same model with identical settings, so any difference in output comes from the prompt, not the configuration.
- **Compare side-by-side** with metrics per run: latency, input/output tokens, word count, character count.
- **Auto-score (optional)** — an LLM-as-judge pass ranks the outputs against a rubric you provide and summarizes how specificity related to quality.

## Providers — real results, free, no key

The app can talk to three backends, switchable in the UI. It auto-detects what's available and picks a sensible default.

| Provider | Real outputs? | Needs | Best for |
| --- | --- | --- | --- |
| **Ollama (local)** | ✅ yes | [Ollama](https://ollama.com) running locally + a pulled model | The "accessible for all" path: genuine results, free, no API key, fully private |
| **Anthropic (Claude)** | ✅ yes | `ANTHROPIC_API_KEY` | Evaluating against Claude specifically |
| **Demo** | ❌ simulated | nothing | Trying the UI with zero setup (outputs are placeholders, clearly flagged) |

**Recommended: Ollama.** It runs a real open model on your own machine, so anyone can get true results for free — no key, no cost, no data leaving the computer. The research question holds exactly: you're studying how prompt specificity changes a real model's output.

### Quick start with Ollama (real, free, local)

1. Install Ollama from [ollama.com](https://ollama.com) and start it.
2. Pull a model (small models run on modest hardware):
   ```bash
   ollama pull llama3.2
   ```
3. Run the app (below) and pick **Ollama** as the provider. That's it — real outputs, no key.

> Trade-off: Ollama evaluates a local **open** model (Llama, Qwen, Mistral…), not Claude. Use the Anthropic provider if you specifically need Claude. "Accessible for all" here means *anyone willing to install Ollama and pull a model* — more setup than a hosted URL, but the results are real and free.

## Run the app

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Configure a provider — see [`.env.example`](.env.example). You don't
   need this for Ollama or Demo; add `ANTHROPIC_API_KEY` to `.env.local` only for Claude.
3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open the printed URL (usually http://localhost:3000). Click **Load an example** for a pre-filled task, pick a provider, and **Run all**.

## You will not get demo output by accident

This app is **local-first**. The provider picker only offers **Ollama** and **Anthropic** — both real. Demo is *not* selectable and is *never* used as a fallback: if Ollama isn't running you get a clear "start Ollama" prompt, not a silent simulation. Every result is also stamped with its source (`ollama · llama3.2` vs `simulated`) so you can verify each one.

The **only** way to get simulated output is to explicitly set `PROMPT_EVAL_DEMO=1` (which forces demo everywhere and shows a banner). Leave it unset for normal use.

> "Real" is guaranteed under a real provider; **accuracy is the model's job, not the app's.** A small model like `llama3.2` (3B) returns genuine but sometimes weak answers — pull a stronger model (`ollama pull llama3.1:8b` / `qwen2.5`) or use Anthropic for higher quality.

## Stack

Next.js (App Router) + TypeScript. API keys live only on the server (`app/api/*`) and are never exposed to the browser. A provider abstraction in `lib/` dispatches each call to Ollama, Anthropic, or the demo mock.

## Deploy

Deploys to any Node host that runs Next.js (Vercel, Render, Fly, a container, etc.).

- A **hosted** deploy can't reach a visitor's local Ollama, so for a public site either set `ANTHROPIC_API_KEY` (real Claude, you pay) or run in **Demo** mode (`PROMPT_EVAL_DEMO=1`, simulated, free). The Ollama path is for people running the app on their own machine.
- On Vercel: import the repo, set env vars, deploy. The API routes request up to 60s (`maxDuration = 60`); on shorter-timeout plans keep **Max tokens**/**Effort** modest.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | The single-page UI (provider, task, variants, results, judge). |
| `app/api/run/route.ts` | Runs one prompt variant, returns output + metrics. |
| `app/api/generate-variants/route.ts` | Generates specificity-level variants for a task. |
| `app/api/judge/route.ts` | LLM-as-judge scoring of a set of outputs. |
| `app/api/status/route.ts` | Reports which providers are usable right now. |
| `lib/model.ts` | Dispatcher: routes each call to the chosen provider + builds status. |
| `lib/ollama.ts` · `lib/anthropic.ts` · `lib/demo.ts` | The three provider implementations. |
| `lib/util.ts` · `lib/types.ts` | Shared helpers and types (server + client). |

## Notes on method

- **Keep settings constant across a run.** Provider, model, max tokens (and, for Claude, effort/thinking) are applied identically to every variant — that's what isolates the prompt as the variable.
- **Compare like with like.** Don't compare a variant run on Ollama against one run on Claude; switch providers only between whole runs.
- **The judge is a signal, not ground truth.** It runs on your selected provider and can be biased toward length or confidence. Read the outputs yourself alongside the scores.
