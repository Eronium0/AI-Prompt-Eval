"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  EFFORT_LEVELS,
  defaultModelFor,
  type Task,
  type Variant,
  type RunSettings,
  type RunResult,
  type Provider,
  type StatusResponse,
  type GenerateVariantsResponse,
  type JudgeResponse,
} from "@/lib/types";

type CellState = {
  status: "idle" | "running" | "done" | "error";
  result?: RunResult;
  error?: string;
};

// Deterministic, monotonic IDs (avoids server/client hydration mismatch).
let _idSeq = 0;
const uid = () => `v${++_idSeq}`;

function newVariant(label = "", prompt = ""): Variant {
  return { id: uid(), label, prompt };
}

const PROVIDER_LABEL: Record<Provider, string> = {
  ollama: "Ollama (local, real, free)",
  anthropic: "Anthropic / Claude (real, key)",
  demo: "Demo (simulated)",
};

function pickModel(p: Provider, st: StatusResponse | null): string {
  if (p === "ollama") return st?.providers.ollama.models[0] ?? defaultModelFor("ollama");
  if (p === "anthropic")
    return st?.providers.anthropic.models[0] ?? defaultModelFor("anthropic");
  return defaultModelFor("demo");
}

const EXAMPLE_TASK: Task = {
  name: "Summarize a product update",
  description:
    "A clear, accurate summary a busy reader can skim in seconds. Faithful to the input, no invented details.",
  input:
    "Our v2.3 release ships a redesigned dashboard, 40% faster cold starts, SSO for enterprise plans, and fixes a bug where exports over 10MB failed silently. Available today on all paid tiers.",
};

const EXAMPLE_VARIANTS: Variant[] = [
  newVariant("Bare", "Summarize this."),
  newVariant("Light detail", "Summarize this product update in 2-3 sentences."),
  newVariant(
    "Detailed",
    "Summarize this product update as 3 bullet points for a busy executive. Lead with the most important change. Neutral tone."
  ),
  newVariant(
    "Highly constrained",
    "Summarize this product update as exactly 3 bullets, max 12 words each, ordered by user impact (highest first). No marketing language. Plain text, no emoji."
  ),
];

export default function Page() {
  const [task, setTask] = useState<Task>({ name: "", description: "", input: "" });
  const [settings, setSettings] = useState<RunSettings>(DEFAULT_SETTINGS);
  const [variants, setVariants] = useState<Variant[]>(() => [
    newVariant("Variant 1", ""),
  ]);
  const [basePrompt, setBasePrompt] = useState("");
  const [genCount, setGenCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [runningAll, setRunningAll] = useState(false);

  const [rubric, setRubric] = useState("");
  const [judging, setJudging] = useState(false);
  const [judge, setJudge] = useState<JudgeResponse | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [checking, setChecking] = useState(false);

  // `applyDefault` only on first load — a manual re-check shouldn't yank the
  // provider the user has already chosen.
  async function loadStatus(applyDefault: boolean) {
    setChecking(true);
    try {
      const s = (await (await fetch("/api/status")).json()) as StatusResponse;
      setStatus(s);
      if (applyDefault) {
        setSettings((prev) => ({
          ...prev,
          provider: s.defaultProvider,
          model: pickModel(s.defaultProvider, s),
        }));
      } else {
        // Keep current provider; refresh its model if it now has options.
        setSettings((prev) => ({ ...prev, model: pickModel(prev.provider, s) }));
      }
    } catch {
      // leave status as-is
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadStatus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchTask(p: Partial<Task>) {
    setTask((t) => ({ ...t, ...p }));
  }
  function patchSettings(p: Partial<RunSettings>) {
    setSettings((s) => ({ ...s, ...p }));
  }
  function changeProvider(p: Provider) {
    patchSettings({ provider: p, model: pickModel(p, status) });
  }
  function updateVariant(id: string, p: Partial<Variant>) {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...p } : v)));
  }
  function addVariant() {
    setVariants((vs) => [...vs, newVariant(`Variant ${vs.length + 1}`, "")]);
  }
  function removeVariant(id: string) {
    setVariants((vs) => vs.filter((v) => v.id !== id));
    setCells((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
  }
  function loadExample() {
    setTask(EXAMPLE_TASK);
    setVariants(EXAMPLE_VARIANTS.map((v) => ({ ...v, id: uid() })));
    setBasePrompt("Summarize this product update.");
    setRubric(
      "Faithfulness to the input (no invented facts), brevity, and how easy it is to skim."
    );
    setCells({});
    setJudge(null);
  }

  async function generateVariants() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/generate-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, basePrompt, count: genCount, settings }),
      });
      const data = (await res.json()) as GenerateVariantsResponse | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Generation failed.");
      }
      setVariants(data.variants.map((v) => newVariant(v.label, v.prompt)));
      setCells({});
      setJudge(null);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function runVariant(v: Variant) {
    setCells((c) => ({ ...c, [v.id]: { status: "running" } }));
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: v.prompt, task, settings }),
      });
      const data = (await res.json()) as RunResult | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Run failed.");
      }
      setCells((c) => ({ ...c, [v.id]: { status: "done", result: data } }));
    } catch (e) {
      setCells((c) => ({
        ...c,
        [v.id]: { status: "error", error: e instanceof Error ? e.message : "Run failed." },
      }));
    }
  }

  async function runAll() {
    const runnable = variants.filter((v) => v.prompt.trim());
    if (!runnable.length) return;
    setRunningAll(true);
    setJudge(null);
    // Fire concurrently; each cell updates as its request resolves.
    await Promise.allSettled(runnable.map((v) => runVariant(v)));
    setRunningAll(false);
  }

  async function runJudge() {
    const items = variants
      .filter((v) => cells[v.id]?.status === "done" && cells[v.id]?.result)
      .map((v) => ({
        variantId: v.id,
        label: v.label,
        prompt: v.prompt,
        output: cells[v.id].result!.output,
      }));
    if (!items.length) return;
    setJudging(true);
    setJudgeError(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, rubric, items, settings }),
      });
      const data = (await res.json()) as JudgeResponse | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Judging failed.");
      }
      setJudge(data);
    } catch (e) {
      setJudgeError(e instanceof Error ? e.message : "Judging failed.");
    } finally {
      setJudging(false);
    }
  }

  const scoreFor = (id: string) =>
    judge?.rankings.find((r) => r.variantId === id)?.score;
  const doneCount = variants.filter((v) => cells[v.id]?.status === "done").length;

  const provider = settings.provider;
  const pInfo = status?.providers[provider];
  const forced = status?.demoForced ?? false;
  const ollamaModels = status?.providers.ollama.models ?? [];
  const anthropicModels = status?.providers.anthropic.models ?? [];
  // Local-first: demo is never offered in the picker — it's only reachable by
  // explicitly setting PROMPT_EVAL_DEMO, which forces it everywhere.
  const providerOptions: Provider[] = forced ? ["demo"] : ["ollama", "anthropic"];

  return (
    <div className="container">
      <header>
        <h1>AI Prompt Eval</h1>
        <p>
          Define a task, run prompts of varying specificity, and see how the
          changes affect the output. New here?{" "}
          <button className="ghost" onClick={loadExample}>
            Load an example
          </button>
        </p>
      </header>

      {/* PROVIDER STATUS BANNERS */}
      {forced && (
        <div className="demo-banner">
          <b>Demo mode forced</b> via <code>PROMPT_EVAL_DEMO</code> — every call
          returns <b>simulated</b> output regardless of the provider selected
          below. Unset it to use a real provider.
        </div>
      )}
      {!forced && provider === "ollama" && status && !pInfo?.available && (
        <div className="demo-banner">
          <b>Ollama not detected</b> at <code>{status.ollamaHost}</code>. To get
          real, free, local results: install it from <b>ollama.com</b>, start it,
          then pull a model — e.g. <code>ollama pull {settings.model}</code>. Runs
          will fail until it&apos;s running.
        </div>
      )}
      {!forced &&
        provider === "ollama" &&
        pInfo?.available &&
        ollamaModels.length === 0 && (
          <div className="demo-banner">
            <b>Ollama is running, but no models are pulled.</b> Pull one to start:{" "}
            <code>ollama pull {settings.model}</code>.
          </div>
        )}
      {!forced && provider === "anthropic" && status && !pInfo?.available && (
        <div className="demo-banner">
          <b>No Anthropic key set.</b> Add <code>ANTHROPIC_API_KEY</code> on the
          server to use Claude, or switch to Ollama (local) / Demo.
        </div>
      )}

      {/* TASK */}
      <section className="panel">
        <h2>1 · Task</h2>
        <div className="field">
          <label>Task name</label>
          <input
            value={task.name}
            onChange={(e) => patchTask({ name: e.target.value })}
            placeholder="e.g. Summarize a product update"
          />
        </div>
        <div className="field">
          <label>What good output looks like (goal)</label>
          <textarea
            value={task.description}
            onChange={(e) => patchTask({ description: e.target.value })}
            placeholder="Used to guide variant generation and scoring."
          />
        </div>
        <div className="field">
          <label>Fixed input (optional — held constant across every variant)</label>
          <textarea
            value={task.input}
            onChange={(e) => patchTask({ input: e.target.value })}
            placeholder="e.g. the article to summarize. Leave blank if each prompt is self-contained."
          />
        </div>
      </section>

      {/* SETTINGS */}
      <section className="panel">
        <h2>2 · Run settings (constant across variants)</h2>
        <div className="row">
          <div>
            <label>
              Provider{" "}
              <button
                className="ghost"
                style={{ padding: "0 6px" }}
                onClick={() => loadStatus(false)}
                disabled={checking}
                title="Re-check which providers are available (e.g. after starting Ollama)"
              >
                {checking ? "checking…" : "↻ re-check"}
              </button>
            </label>
            <select
              value={provider}
              onChange={(e) => changeProvider(e.target.value as Provider)}
              disabled={forced}
            >
              {providerOptions.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                  {status && !status.providers[p].available ? " — not ready" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Model</label>
            {provider === "ollama" && ollamaModels.length > 0 ? (
              <select
                value={settings.model}
                onChange={(e) => patchSettings({ model: e.target.value })}
              >
                {ollamaModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : provider === "anthropic" && anthropicModels.length > 0 ? (
              <select
                value={settings.model}
                onChange={(e) => patchSettings({ model: e.target.value })}
              >
                {anthropicModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={settings.model}
                disabled={provider === "demo"}
                onChange={(e) => patchSettings({ model: e.target.value })}
                placeholder={provider === "ollama" ? "e.g. llama3.2" : "model name"}
              />
            )}
          </div>

          <div>
            <label>Max tokens</label>
            <input
              type="number"
              min={128}
              max={64000}
              value={settings.maxTokens}
              onChange={(e) =>
                patchSettings({ maxTokens: Number(e.target.value) || 2048 })
              }
            />
          </div>

          {provider === "anthropic" && (
            <>
              <div>
                <label>Effort</label>
                <select
                  value={settings.effort}
                  onChange={(e) =>
                    patchSettings({ effort: e.target.value as RunSettings["effort"] })
                  }
                >
                  {EFFORT_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Thinking</label>
                <select
                  value={settings.thinking ? "on" : "off"}
                  onChange={(e) =>
                    patchSettings({ thinking: e.target.value === "on" })
                  }
                >
                  <option value="on">adaptive (on)</option>
                  <option value="off">off</option>
                </select>
              </div>
            </>
          )}
        </div>
        <p className="inline-note">
          Settings are identical for every variant, so any output difference comes
          from the prompt — not the configuration.
          {provider === "ollama" &&
            " Ollama runs a model on your own machine: real results, free, no key."}
        </p>
      </section>

      {/* VARIANTS */}
      <section className="panel">
        <h2>3 · Prompt variants</h2>

        <div className="variant-card" style={{ background: "transparent", border: "1px dashed var(--border)" }}>
          <label>Auto-generate specificity levels (optional)</label>
          <div className="field">
            <input
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="Base prompt idea (e.g. 'Summarize this update'). Leave blank to let the model invent one."
            />
          </div>
          <div className="toolbar">
            <label style={{ margin: 0 }}>Levels:</label>
            <input
              type="number"
              min={2}
              max={6}
              value={genCount}
              onChange={(e) => setGenCount(Number(e.target.value) || 4)}
              style={{ maxWidth: 80 }}
            />
            <button
              className="secondary"
              onClick={generateVariants}
              disabled={generating}
            >
              {generating ? "Generating…" : "Generate variants"}
            </button>
            {genError && <span className="error">{genError}</span>}
          </div>
          <p className="inline-note">
            Replaces the list below with prompts from least to most specific — a
            starting point you can then edit by hand.
          </p>
        </div>

        {variants.map((v, i) => (
          <div className="variant-card" key={v.id}>
            <div className="variant-head">
              <input
                value={v.label}
                onChange={(e) => updateVariant(v.id, { label: e.target.value })}
                placeholder={`Label ${i + 1}`}
              />
              <button
                className="ghost"
                onClick={() => removeVariant(v.id)}
                disabled={variants.length <= 1}
                title="Remove variant"
              >
                Remove
              </button>
            </div>
            <textarea
              value={v.prompt}
              onChange={(e) => updateVariant(v.id, { prompt: e.target.value })}
              placeholder="The prompt text for this variant…"
            />
          </div>
        ))}

        <div className="toolbar">
          <button className="secondary" onClick={addVariant}>
            + Add variant
          </button>
          <button onClick={runAll} disabled={runningAll}>
            {runningAll ? "Running…" : "▶ Run all"}
          </button>
        </div>
      </section>

      {/* RESULTS */}
      {variants.some((v) => cells[v.id]) && (
        <section className="panel">
          <h2>4 · Results</h2>
          <div className="results-grid">
            {variants
              .filter((v) => cells[v.id])
              .map((v) => {
                const cell = cells[v.id];
                const score = scoreFor(v.id);
                return (
                  <div className="result-card" key={v.id}>
                    <h3>
                      {v.label || "Variant"}{" "}
                      {score != null && (
                        <span className="badge score">{score}/100</span>
                      )}
                    </h3>
                    <div className="result-prompt">{v.prompt}</div>

                    {cell.status === "running" && (
                      <div className="spinner">Running…</div>
                    )}
                    {cell.status === "error" && (
                      <div className="error">{cell.error}</div>
                    )}
                    {cell.status === "done" && cell.result && (
                      <>
                        <span
                          className={`src-tag ${
                            cell.result.provider === "demo" ? "simulated" : "real"
                          }`}
                        >
                          {cell.result.provider === "demo"
                            ? "⚠ simulated (demo)"
                            : `${cell.result.provider} · ${cell.result.model}`}
                        </span>
                        {cell.result.refusal && (
                          <div className="error">
                            Model refused this request.
                          </div>
                        )}
                        <div className="output">{cell.result.output}</div>
                        <div className="metrics">
                          <span className="metric">
                            <b>{cell.result.metrics.latencyMs}</b> ms
                          </span>
                          <span className="metric">
                            in <b>{cell.result.metrics.inputTokens}</b>
                          </span>
                          <span className="metric">
                            out <b>{cell.result.metrics.outputTokens}</b>
                          </span>
                          <span className="metric">
                            <b>{cell.result.metrics.wordCount}</b> words
                          </span>
                          <span className="metric">
                            <b>{cell.result.metrics.charCount}</b> chars
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* JUDGE */}
      {doneCount >= 1 && (
        <section className="panel">
          <h2>5 · Auto-score (LLM-as-judge)</h2>
          <div className="field">
            <label>Rubric (optional)</label>
            <textarea
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              placeholder="How should outputs be scored? Defaults to overall quality vs. the task goal."
            />
          </div>
          <div className="toolbar">
            <button onClick={runJudge} disabled={judging}>
              {judging ? "Scoring…" : `Score ${doneCount} output(s)`}
            </button>
            {judgeError && <span className="error">{judgeError}</span>}
          </div>
          {judge && (
            <div className="judge-summary">
              <strong>Judge summary.</strong> {judge.summary}
            </div>
          )}
          <p className="inline-note">
            The judge runs on the same provider you selected. An LLM judge is a
            useful signal, not ground truth — it can be biased toward length or
            confidence. Read the outputs yourself too.
          </p>
        </section>
      )}
    </div>
  );
}
