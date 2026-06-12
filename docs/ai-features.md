# AI features — fit-judge & resume tailoring

The scrape → de-dupe → score → triage core needs **no AI**. The two AI features
sit on top and handle the reading-heavy work you'd otherwise do by hand. Both are
**off by default**; flip them on in **Settings → AI/LLM**.

> [!TIP]
> Pick a backend, run the one-click connection check, and turn on what you want.
> For which model to use and the privacy rule that matters, see
> [model-tradeoffs.md](model-tradeoffs.md).

---

## ⚖️ 1. Fit-judge — a structured second opinion

The keyword matcher is great at recall but can't read. The judge adds precision:
for each matched job it reads the full JD against a rubric you write and returns:

- An overall verdict — **STRONG · DECENT · WEAK · SKIP**.
- A short summary + the reasons behind it.
- Any **hard blockers** (e.g. "on-site only, no visa sponsorship").
- A **per-dimension breakdown** — **skills · seniority · domain · location · red flags** — each rated and backed by 1–2 short quotes from the JD, so you know exactly *why*.

Shows up as a **sortable chip** on each row. Most useful move: sort by verdict, read STRONGs first.

**Advisory only — always.** The judge never hides or blocks a job. It adds a chip
and a sort, nothing more. If keyword score is high but verdict is SKIP, the UI
flags the divergence — but the job still shows.

### How it runs

- Only judges jobs at or above `min_score` (default **50**) — the LLM is the
  expensive layer, so it focuses on jobs the matcher already likes. The per-job
  **Re-judge** button bypasses this floor.
- Verdicts are **frozen to the JD** they were computed against — you don't
  re-pay for the same posting unless the JD changes or you hit Re-judge.
- The scrape **never** auto-judges. Click **Judge jobs**, it shows you the
  **estimated token cost**, you confirm, it runs. A failure on one job is logged
  and skipped; your matches and statuses are never touched.

### Writing a good rubric 📝

The rubric lives at `profile/judge-rubric.md` (template in `profile.example/`).
Plain language — just tell the judge how *you* weigh a job:

- **Who you are** (role + level you're targeting, 1–2 lines).
- **What makes a STRONG vs a SKIP** — be concrete: "STRONG = backend-heavy, TypeScript/Node, fintech or crypto, remote or EU. SKIP = primarily front-end, or requires US relocation."
- **Hard blockers** — location/visa constraints, seniority ceiling, domains you won't touch.
- **Nice-to-haves** that tip a DECENT into a STRONG.

Don't want to write from scratch? **Settings → AI/LLM** can auto-author the
rubric from your uploaded resume, then you refine it by prompt ("be stricter on
location"). Edit any time; the next run picks it up.

---

## 📄 2. Resume tailoring — a one-page PDF per job

With the local **`claude` CLI** installed, a **Generate resume** button appears on
every job. It drafts a one-page resume tuned to that posting from your base
resume and renders a clean PDF to `profile/generated/`.

The rule is strict: **the model writes the words, the code controls the layout.**
The LLM never emits formatting; the renderer never paraphrases. Same inputs →
same one-page PDF, every time.

> [!NOTE]
> **Host-only** — uses your local `claude` CLI (billed to your subscription, no
> API key needed). The button hides itself when the CLI isn't installed.

In **Settings → Resumes**, upload your resume as `.docx` or `.pdf`. jobctl
extracts the text, an LLM drafts your **resume-gen rules**, and you refine from
there. Prefer to write them yourself? Drop a `RESUME_GENERATION_SKILL.md` into
`profile/` (template in `profile.example/`). Useful things to include: which base
resume to start from, what to emphasize per role type, what to never claim, and a
one-page / results-first tone note.

---

## Backends & model routing

Two backend types:

- **`claude-cli`** — your local Claude CLI, existing subscription, no API key.
  The only backend that can run resume generation.
- **`openai-compatible`** — any OpenAI-style API: OpenAI, Gemini, DeepSeek,
  OpenRouter, or a local **Ollama** model. API key goes in an **env var**, never
  in YAML.

Route cheap vs. quality tasks to different models:

- `llm.judge.model` — fast/cheap (e.g. Haiku) for judging many jobs.
- `llm.resume.model` — stronger (e.g. Sonnet) for writing; also used to
  auto-author your rubric and resume rules.

Leave either blank to use the backend's default. The Settings tab shows a
**pre-run token estimate** before you kick off a judge run.

> [!IMPORTANT]
> **The one privacy rule:** free tiers may train on what you send. That's fine
> for semi-public job descriptions (judging), but **resume generation should use
> a paid or local non-training backend** — your resume is *you*. Full guidance in
> [model-tradeoffs.md](model-tradeoffs.md).

---

## TL;DR

- Core works fine with no AI. The AI is optional and yours to control.
- **Fit-judge:** advisory verdicts + per-dimension, JD-quoted breakdown so you triage by real fit. Write a clear `judge-rubric.md` (or auto-author it).
- **Resume tailoring:** one-page tailored PDF per job; model writes words, code owns layout. Shape it with `RESUME_GENERATION_SKILL.md`.
- Route a cheap model to the judge, a stronger one to resume writing, and keep your resume on a non-training backend.
