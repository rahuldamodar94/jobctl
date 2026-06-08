# jobctl

Self-hosted job-search hunter & tracker for engineers. Scrapes public job boards and
company ATS APIs on command, scores every listing against **your** role profile
with a deterministic keyword matcher — no LLM, no API keys, zero running cost —
and gives you one data-dense page to triage: open the JD, set a status, never
see the same job twice.

**Ships with a curated, live-verified registry of 110+ company job boards**
across web3, DeFi, fintech/payments, exchanges, and AI/dev-infra (with strong
MENA & India representation) — pick the domains you care about and go.

```
job boards (jobstash, web3.career, remotive, …) ─┐
                                                  ├─▶ dedupe ▶ score ▶ SQLite ▶ triage UI
company ATS boards (registry × your domains)    ─┘                              :3000
```

## Why

- **One inbox** instead of checking ten job boards every morning
- **Your rules**: title keywords, must-have stack, weighted boosts, hard
  exclusions, geo tiers — all YAML; every scrape rescores everything, so tuning
  takes effect immediately
- **Anti-re-suggest**: jobs you applied to or dismissed never resurface, even
  reposted on another board with a slightly different title
- **Community registry**: 110+ ATS boards verified against their live APIs,
  tagged by domain — plus a researched list of ~120 companies we *can't* reach
  yet and the same-name traps to avoid (`config/companies-unsupported.md`)
- **Local-first**: your data is one SQLite file; personal config is gitignored

## Quickstart

**Prerequisites:** Node 20+ and npm, git. (Optional: the `claude` CLI for resume
generation / the LLM fit-judge — see below.)

```bash
git clone https://github.com/rahuldamodar94/jobctl.git && cd jobctl
npm install
npm run build && npm start    # → http://localhost:3000
```

On first launch the app shows a **setup wizard** (name → sources → your role →
optional resume) and writes your `profile/` for you — no file editing needed.
Everything is editable later under **Settings** in the app. Then click
**Run scrape** (or `npm run scrape`).

Prefer files? You can still `cp -r profile.example profile` and hand-edit
`profile.yaml` / `roles.yaml` instead of using the wizard.

Dev mode (hot reload): `npm run dev` → UI on :5173 proxying the API on :3000.

Already mid-job-hunt? Jobs you've applied to will appear as `new` on the first
scrape — mark them `applied`/`dismissed` once and they're suppressed forever,
even when reposted elsewhere with different wording.

### Docker

```bash
cp -r profile.example profile   # edit, then:
docker compose up -d --build    # → http://localhost:3000
docker compose exec jobctl npm run scrape   # or use the UI button
```

`./data` (SQLite) and `./profile` (your config) are bind-mounted — the
container is stateless. **Linux note:** if SQLite reports read-only, set
`user: "<your-uid>:<your-gid>"` in docker-compose.yml (the bind mount is owned
by your host user).

## Configure

Easiest: the in-app **Settings** page (and first-run wizard) edits all of the
personal files below — validated, no terminal. The files are still the source
of truth if you'd rather edit them directly:

| File | Owner | What |
|---|---|---|
| `profile/profile.yaml` | you (gitignored) | domains to scrape, boards, max job age, resumes, ui_prefs |
| `profile/roles.yaml` | you (gitignored) | role searches: titles, stack, weighted keywords, exclusions, geo, IC/EM lane |
| `config/companies.yaml` | committed | community company registry, domain-tagged |
| `config/sources.yaml` | committed | job-board definitions |
| `config/categories.yaml` | committed | category keyword rules (overridable per profile) |

## Sources

| Source | Method |
|---|---|
| Greenhouse / Lever / Ashby company boards | public board APIs (full JDs), driven by the registry |
| jobstash.xyz | public JSON API (full JDs) |
| web3.career, cryptocurrencyjobs.co, blockchainheadhunter.com | static HTML |
| remotive.com, remoteok.com | public JSON APIs (general remote boards) |

Scraping is polite by construction: identifiable UA, sequential sources,
per-host delays, retry with backoff, a few hundred requests per run.

**Add a company**: paste its board URL into `profile/profile.yaml →
companies.include` (provider auto-detected) — or PR it into the registry with
domain tags so everyone benefits.
**Add a board**: one adapter file in `src/sources/boards/` implementing
`{ id, fetch(ctx): RawJob[] }` + one entry in `config/sources.yaml`.

## Daily workflow

1. Open the UI → **Run scrape** (or cron `npm run scrape`)
2. The status strip reports `38 new · 5/5 sources OK` — failures are named, never silent
3. Triage the default view (`new`, score ≥ 30, ≤ 14 days): expand row →
   **Open JD →** → set status (`interested / applied / rejected / dismissed`)
4. Done. Tomorrow only genuinely new jobs appear.

## Commands

```bash
npm run scrape                 # scrape all enabled sources
npm run scrape -- --source X   # one source (debugging)
npm run judge                  # run the optional fit-judge over matched jobs
npm run dev / build / start    # UI + server
npm test                       # vitest
```

## Optional: per-job resume generation (no API key)

If you have the [Claude Code](https://claude.com/claude-code) CLI installed and
logged in, add a `RESUME_GENERATION_SKILL.md` to `profile/` (template in
`profile.example/`) with your tailoring rules, and a **Generate resume** button
appears on every job. Your local `claude` does the tailoring (billed to your
existing subscription — no API key, no extra cost) and the app renders a
one-page PDF matching your template into `profile/generated/<date>-<company>/`.

Design split: the LLM writes the *content* (following your rules); deterministic
code renders the *layout* — same input, same PDF. The feature auto-hides when
the CLI isn't present (e.g. inside the Docker container — it's host-only).

**Docker users:** when you want resume generation, run the app on the host
instead: `npm run build && npm start` (same production server as the
container, plus your local CLI auth). A token-in-env Docker setup
(`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`) was considered and
rejected: parking a long-lived credential in a `.env` file isn't worth it
for a single-user tool when the host path already works.

## Optional: LLM fit-judge (advisory)

A second-stage precision layer over the keyword matcher. For matched jobs it
reads the JD against **your** rubric and returns a 4-level verdict
(**STRONG / DECENT / WEAK / SKIP**) plus reasons and hard-blocker flags, shown
as a chip you can sort/filter by. **Advisory only — it never hides or gates a
job** (same spirit as the unmatched audit view).

Enable it in `profile/profile.yaml` under `llm.judge.enabled: true`, and write a
`profile/judge-rubric.md` describing you (template in `profile.example/`). It
runs on either:

- the local **`claude` CLI** (free, billed to your subscription — no API key), or
- any **OpenAI-compatible backend** (OpenAI / Gemini / DeepSeek / OpenRouter /
  Ollama) — the API key lives in an env var via `api_key_env`, never in YAML.

Run it from the UI's **Re-judge** button, automatically during a scrape, or
`npm run judge [-- --all | --id N]`. Verdicts are frozen per JD hash (a changed
JD re-judges). **Privacy:** free judge tiers may train on input — fine for
semi-public job descriptions, but resume generation must use a non-training
(paid/local) backend.

## Design decisions (read before filing "missing X" issues)

- **No auth, no helmet, no rate limiting** — this binds to localhost for a
  single user. Don't expose it to the internet; put auth in front if you must.
- **No LLM** — scoring is deterministic keyword matching you can debug and tune.
  An LLM pass may come as an optional v2 layer.
- **No headless browser** — every supported source is plain-HTTP. Sources that
  require JS rendering are documented in `config/companies-unsupported.md`.
- **SQLite, one file** — dedupe is a UNIQUE index, status updates are
  transactions, backup is `cp`. WAL mode lets the CLI and server write
  concurrently.
- **CLI runs via tsx in the container** (server runs compiled `dist/`) — one
  image that can scrape, seed, and serve without a second build pipeline.
- **Old-but-open ATS postings are kept** — a job returned by the company's own
  board API is open by definition; only aggregator-board listings are
  age-filtered (`max_age_days`).

## Architecture

See [CLAUDE.md](CLAUDE.md): data model, dedup invariants, scoring formula,
reliability rules, ATS endpoint patterns for future adapters, and the v2 roadmap.

## The name

`jobctl` = "job control" — a `kubectl` / `systemctl`-style CLI for running your
own job search, locally. Lowercase, self-hosted, yours.

## License

[MIT](LICENSE) © 2026 Rahul Prabhu
