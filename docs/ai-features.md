# AI features — fit-judge & resume tailoring

jobctl's core (scrape → de-dupe → score → triage) needs **no AI at all**. The two
AI features sit *on top* and do the reading-heavy work you'd otherwise do by hand.
Both are **off by default** and entirely optional. This guide explains what they
are, how to set them up, and — most importantly — how to write the two small
config files that make them genuinely useful to *you*.

> [!TIP]
> **Setup in one place:** everything below is configured under **Settings →
> AI/LLM** in the app. Pick a backend, run the one-click connection check, and turn
> on what you want. For *which* model to use and the privacy rule that matters, see
> [model-tradeoffs.md](model-tradeoffs.md).

---

## ⚖️ 1. The fit-judge — a structured second opinion

The keyword matcher is great at *recall* (finding everything that could fit) but
it can't read. The fit-judge adds *precision*: for each matched job, it reads the
full JD against a rubric **you** write and returns:

- An overall verdict — **STRONG · DECENT · WEAK · SKIP**.
- A short summary and the reasons behind the verdict.
- Any **hard blockers** it spotted (e.g. "on-site only, no visa sponsorship").
- A **per-dimension breakdown** — **skills · seniority · domain · location · red
  flags** — each rated and **backed by 1–2 short quotes pulled straight from the
  JD**, so you can see exactly *why* it said what it said.

It shows up as a **sortable, filterable chip** on each row. The most useful move:
sort your shortlist by verdict and read the STRONGs first.

**It's advisory — always.** The judge never hides, blocks, or down-ranks a job in
the matcher. It adds a chip and a sort, nothing more. (If a job's keyword score is
high but the judge says SKIP, the UI flags the divergence so a green score next to
a SKIP chip is never confusing — but the job still shows.)

### How it runs

- It only judges jobs at or above a **score floor** (`min_score`, default 50) — the
  LLM is the expensive layer, so it's pointed at jobs the matcher already likes. The
  per-job **Re-judge** button bypasses the floor.
- A verdict is **frozen to the JD it was computed against**. If the JD changes, or
  you hit Re-judge, it re-runs; otherwise it's cached, so you don't pay to re-judge
  the same posting.
- The scrape **does not** auto-judge. Judging is always something you start — the
  **Judge jobs** button clears the un-judged backlog and **shows you the estimated
  token cost first**, so you opt into the spend.
- A failure on one job is logged and skipped; it never touches your matches or
  statuses.

### Writing a good judge rubric

The rubric lives at `profile/judge-rubric.md` (template in `profile.example/`). It's
plain language — you're telling the judge how *you* weigh a job. A good rubric
usually covers:

- **Who you are** in one or two lines (the role and level you're targeting).
- **What makes a STRONG fit** vs a SKIP — be concrete. "STRONG = backend-heavy,
  TypeScript/Node, fintech or crypto, remote or EU. SKIP = primarily front-end, or
  requires relocation to the US."
- **Hard blockers** — the things that should always be called out: location/visa
  constraints, a seniority floor or ceiling, domains you won't work in.
- **Nice-to-haves** that tip a DECENT into a STRONG.

You don't have to start from scratch: in **Settings → AI/LLM**, jobctl can
**auto-author the rubric from your uploaded resume**, and you then refine it by
prompt ("be stricter on location", "treat payments experience as a strong
signal"). Edit it any time; the next judge run uses the new version.

---

## 📄 2. Resume tailoring — a one-page PDF per job

With your local **`claude` CLI** installed and logged in, a **Generate resume**
button appears on every job. It drafts a one-page resume tuned to *that* posting
from your base resume, and renders it to a clean PDF in `profile/generated/`.

The design rule is strict and deliberate: **the model writes the words, the code
controls the layout.** The LLM never emits formatting and the renderer never
paraphrases content, so the same inputs always produce the same one-page PDF — no
surprises, no two-page overflow.

> [!NOTE]
> This feature is **host-only** — it uses your local `claude` CLI (billed to your
> existing subscription, no API key). The button hides itself when the CLI isn't
> installed.

### Setting it up

In **Settings → Resumes**, upload your resume as `.docx` or `.pdf`. jobctl extracts
the text, and an LLM drafts your **resume-gen rules** for you — which you then
refine. Prefer to write them yourself? Drop a `RESUME_GENERATION_SKILL.md` into
`profile/` (template in `profile.example/`).

### Writing a good resume-gen skill

The skill file is your instruction set for tailoring. Useful things to specify:

- **Which base resume** to start from, and your real contact line (never invented).
- **What to emphasize per role type** — e.g. "for backend roles, lead with
  distributed-systems and reliability work; for platform roles, lead with
  developer-experience and tooling".
- **What never to claim** — keep it honest; the model should reframe and reorder
  your real experience, not fabricate it.
- **Tone and length** — one page, concise, results-first.

Like the rubric, this can be **auto-authored from your uploaded resume** and then
refined by prompt.

---

## Backends & model routing

You bring the model; jobctl owns the prompts, parsing, and layout. Two backend
types:

- **`claude-cli`** — your local Claude Code CLI, on your existing subscription. No
  API key, and it's the only backend that can run resume generation.
- **`openai-compatible`** — any OpenAI-style API: OpenAI, Gemini, DeepSeek,
  OpenRouter, or a local **Ollama** model. The key goes in an **environment
  variable**, never in your YAML.

Because the judge is a high-volume, cheap task and resume writing is a low-volume,
quality task, you can **route them to different models**:

- `llm.judge.model` — a cheap, fast model (e.g. Haiku) for judging many jobs.
- `llm.resume.model` — a stronger model (e.g. Sonnet) for writing. This is also the
  model used to auto-author your rubric and resume rules.

Leave either blank to use the backend's default. The **Settings → AI/LLM** tab
shows a pre-run token estimate so you can see roughly what a judge run will cost
before you start it.

> [!IMPORTANT]
> **The one privacy rule:** free LLM tiers may train on what you send. That's fine
> for semi-public job descriptions (the judge), but **resume generation should use a
> paid or local backend that doesn't train on your data** — your resume is *you*.
> Full guidance in [model-tradeoffs.md](model-tradeoffs.md).

---

## TL;DR

- The core works with no AI. The AI is optional and yours to control.
- **Fit-judge:** advisory verdicts + a per-dimension, JD-quoted breakdown so you
  triage by real fit. Write a clear `judge-rubric.md` (or auto-author it).
- **Resume tailoring:** a one-page tailored PDF per job; the model writes words, the
  code owns layout. Shape it with `RESUME_GENERATION_SKILL.md`.
- Route a cheap model to the judge and a stronger one to resume writing, and keep
  your resume on a non-training backend.
