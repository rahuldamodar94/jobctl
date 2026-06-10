# Choosing a model

jobctl is **model-flexible on purpose**: the scrape → dedup → score core runs
with **no model at all** (even fully offline), and the two AI features sit on top
where *you* pick the engine. Nothing is locked to a single vendor or to a coding
CLI.

This doc covers **which backend to use for which feature**, and the one privacy
rule worth getting right.

## The two AI features

| Feature | What it does | Needs a model? |
|---|---|---|
| **Fit-judge** | Reads each matched JD against your rubric → STRONG/DECENT/WEAK/SKIP **+ a per-dimension breakdown** (skills · seniority · domain · location · red flags) with JD evidence. Advisory — never hides a job. | Yes, when enabled |
| **Resume tailoring** | Writes a one-page resume tailored to a specific job; jobctl renders the PDF. | Yes (local `claude` CLI) |

The keyword matcher already gives you a de-duped, scored shortlist without either
of these. AI is the **precision + authoring** layer, not the recall layer.

## The three backend kinds

jobctl talks to models through two engines (`engine:` in `profile.yaml` →
`llm.backends`): the local **`claude-cli`**, and **`openai-compatible`** (one
HTTP shape that covers OpenAI, Gemini, DeepSeek, OpenRouter, and local Ollama).

| Backend | `engine` | Cost | Trains on your input? | Best for |
|---|---|---|---|---|
| **Claude CLI** (your Claude/Code subscription) | `claude-cli` | Included in your plan, no API key | No | Resume tailoring; judge if you already have it |
| **Cloud API — paid tier** (OpenAI, Gemini, DeepSeek, OpenRouter…) | `openai-compatible` | Per-token | Usually **no** on paid tiers — check the provider | Judge at volume; resume if you trust the tier |
| **Cloud API — free tier** (e.g. free Gemini) | `openai-compatible` | Free | **Often yes** | Judge only (job posts are semi-public) |
| **Local model via Ollama** | `openai-compatible` (`base_url` → localhost) | Free, runs on your machine | No — never leaves your laptop | Maximum privacy; judge + resume offline |

## Model routing (judge vs writing) — the cost lever

You don't have to use one model for everything. Two optional per-feature
overrides send each task to the right-sized model:

| Setting | Task | Recommended |
|---|---|---|
| `llm.judge.model` | the fit-judge — a cheap 4-way classification | a small/fast model (**Haiku**) |
| `llm.resume.model` | resume tailoring **and** AI config tuning (rubric/skill/roles/profile) | a stronger model (**Sonnet**) |

Blank = the backend's `model` (or the CLI default). The judge is the only
**per-job** cost, so routing it to a small model is the single biggest saver — a
daily run drops roughly 10× versus judging on Opus/Sonnet. Set both in
**Settings → AI/LLM → Model routing** (one-click Haiku/Sonnet preset for the
Claude CLI). Caching the rubric would save more, but only on API backends, so
model routing is the lever that helps everyone — including the default CLI.

## The one privacy rule

> **Free LLM tiers may train on what you send.** That's fine for the **judge** —
> it only ever sees **job descriptions, which are semi-public**. It is **not**
> fine for **resume generation**, which sends **your** experience. Point resume
> generation at a **paid or local** backend that does not train on your data.

jobctl can't enforce what a provider does with your bytes, so this is a config
choice you make. The safest default is the **local `claude` CLI** (subscription,
no training) for resumes, and **Ollama** if you want everything to stay on your
machine.

## Config

Backends are a named registry; `judge` and `resume` each select one by name.
**API keys live in environment variables (`api_key_env`), never in YAML.**

```yaml
# profile/profile.yaml
llm:
  backends:
    local:                      # your Claude subscription via the CLI
      engine: claude-cli
    cloud:                      # any OpenAI-compatible endpoint
      engine: openai-compatible
      base_url: https://api.openai.com/v1
      model: gpt-4o-mini
      api_key_env: OPENAI_API_KEY      # the KEY itself is in your shell env
    ollama:                     # fully local, offline
      engine: openai-compatible
      base_url: http://localhost:11434/v1
      model: llama3.1

  judge:
    enabled: true
    backend: cloud              # job posts are semi-public → a cheap tier is fine
    model: gpt-4o-mini          # optional: cheap model for the judge classification
  resume:
    backend: local              # your resume is you → non-training backend
    model: sonnet               # optional: stronger model for writing (also AI config tuning)
```

Then put the key in your shell (not in any file jobctl reads):

```bash
export OPENAI_API_KEY=sk-...
```

## Quick recommendations

- **Just want fit signals, cheaply?** Judge on a cheap/free cloud tier, resume on
  the local `claude` CLI.
- **Privacy-maximalist / offline?** Ollama for both. Smaller local models give
  rougher verdicts but never send a byte off your machine.
- **Already living in Claude Code?** Use `claude-cli` for both and skip API keys
  entirely.

## Notes

- The judge freezes its verdict against a hash of the JD text; it re-judges only
  when the JD changes or you hit **Re-judge**. Switching backends doesn't
  auto-refresh existing verdicts — Re-judge to apply a new model.
- Resume generation is **host-only** (needs the local `claude` CLI); the button
  hides itself in Docker.
- Implementation: `src/judge/backends.ts` (engines + JSON-schema output) and
  `src/llm/claude-cli.ts` (the shared CLI runner).
