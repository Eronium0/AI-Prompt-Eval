# AI-Prompt-Eval

A prompt evaluation app, for the sole purpose of research into the effects certain changes in prompts have on the same outcome.

You define a **task**, enter several **prompt variants** of varying specificity and detail, run them all against the same model under identical settings, and compare the outputs side-by-side — with per-run metrics and an optional LLM-as-judge score.

## What it does

- **Define a task** — a name, a description of what good output looks like, and an optional fixed input that's held constant across every variant.
- **Write prompt variants by hand**, or **auto-generate** a ladder of specificity levels (least → most specific) to see the axis before writing your own.
- **Run all variants** against the same model with identical settings, so any difference in output comes from the prompt, not the configuration.
- **Compare side-by-side** with metrics per run: latency, input/output tokens, word count, character count.
- **Auto-score (optional)** — an LLM-as-judge pass ranks the outputs against a rubric you provide and summarizes how specificity related to quality.

## Stack

Next.js (App Router) + TypeScript. The Anthropic API key lives only on the server (in the API routes under `app/api/*`) and is never exposed to the browser. Model calls default to `claude-opus-4-8` with adaptive thinking and streaming, configurable per run in the UI.

## Demo mode (no API key required)

The app runs **without an API key**: when `ANTHROPIC_API_KEY` is unset, it serves
*simulated* outputs (clearly flagged with a "Demo mode" banner) so anyone can
explore the full UI — variants, side-by-side comparison, metrics, and judge
scores — for free. The simulated outputs are format-aware, so the core point is
still visible: more specific prompts produce tighter, more controlled results.

The moment you set a real `ANTHROPIC_API_KEY`, every call uses Claude instead.

You can also **force** demo mode with a real key present (handy for a public
deploy you don't want to pay for, or a key with no credits) by setting
`PROMPT_EVAL_DEMO=1`.

> Demo outputs are placeholders, not real model responses — they don't reflect
> how a specific prompt would actually perform. Add a key for real evaluations.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Add your API key for real outputs:
   ```bash
   cp .env.example .env.local
   # then edit .env.local and set ANTHROPIC_API_KEY
   ```
   Get a key at https://console.anthropic.com/. Skip this step to run in demo mode.
3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. Click **Load an example** for a pre-filled task to try immediately.

## Deploy

Deploys to any Node host that runs Next.js (Vercel, Render, Fly, a container, etc.).

- Set the `ANTHROPIC_API_KEY` environment variable in your host's dashboard — do **not** commit `.env.local`. (Omit it to ship a free, shareable **demo-mode** deploy, or set `PROMPT_EVAL_DEMO=1` to force demo even with a key.)
- On Vercel: import the repo, add the env var, deploy. The API routes request up to 60s of execution (`maxDuration = 60`); on plans with a shorter function timeout, keep **Max tokens** and **Effort** modest, or switch **Thinking** off, to keep runs fast.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | The single-page UI (task, settings, variants, results, judge). |
| `app/api/run/route.ts` | Runs one prompt variant, returns output + metrics. |
| `app/api/generate-variants/route.ts` | Generates specificity-level variants for a task. |
| `app/api/judge/route.ts` | LLM-as-judge scoring of a set of outputs. |
| `lib/anthropic.ts` | Centralized Anthropic client + model/thinking/effort policy. |
| `lib/types.ts` | Shared request/response types used by server and client. |

## Notes on method

- **Keep settings constant across a run.** Model, effort, max tokens, and thinking are applied identically to every variant — that's what isolates the prompt as the variable.
- **The judge is a signal, not ground truth.** LLM judges can be biased toward length or confidence. Read the outputs yourself alongside the scores.
- **Thinking off** adds a "final answer only" instruction so reasoning doesn't leak into the compared output.
