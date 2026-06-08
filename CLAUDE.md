# jobctl — CLAUDE.md

Single source of truth for architecture, conventions, and invariants.
**No personal data in this file** — everything personal lives in gitignored `profile/`.

## What this is

jobctl is a self-hosted job copilot for the **software industry — all roles**
(eng + design/PM/marketing/HR/sales at tech companies). Scrapes company ATS APIs
and tech job boards on command, keyword-scores listings against configurable role
profiles (deterministic core, **no model required**), and serves a single
data-dense triage page. **AI is model-flexible** (Claude `claude -p` / any
OpenAI-compatible API / local Ollama — no coding-CLI lock-in) and sits *on top*
to judge fit and tailor resumes; the scrape→match→triage core runs fully offline
with no model. Ships with a committed, domain-tagged registry of 110+
live-verified company boards. Single user, local-first, Dockerised.
Tagline: "The self-hosted job copilot for the software industry. Your machine,
your model, your data."

Daily workflow: open UI → Run scrape → triage `new, score≥30` list → done.

## Stack & principles

- TypeScript, Node 20+, ESM. One package.json (no workspaces).
- **Express** + **better-sqlite3** (WAL) + static **Vite/React/Tailwind** build.
- One process, one container, one SQLite file (`data/jobs.db`).
- **Config in YAML, state in DB.** Community data committed under `config/`;
  personal selection gitignored under `profile/`; templates in `profile.example/`.
- Matching is **pure functions** driven entirely by config.
- **Nothing personal in committed code** — names, employers, role ids, the
  category taxonomy: all config. Tests assert structurally (derived from
  fixtures), never on personal literals. The UI's dropdown vocabulary
  (roles/sources/categories) comes from `GET /api/config`, never constants.
- Deliberate cuts: no LLM, no caching layer, no queue, no Playwright, no auth,
  no migrations framework (additive ALTERs guarded inline).
- Polite scraping: fixed UA, sequential sources, per-host delays (ATS APIs get
  faster 0.5-1.5s pacing), 10s timeout, retries w/ backoff, 30/60/120s on
  429/503 (fail-fast on last attempt), host allowlist for ATS fetchers.
- All date stamps (first_seen/last_seen/decay cutoffs) use the **local**
  timezone (`localDateISO`) — UTC would mislabel "today" for non-UTC users.

## Config layout (post community-registry restructure)

```
config/                          # COMMITTED — community value
├── companies.yaml               # registry: name + careers_url + domains tags
├── companies-unsupported.md     # researched-but-unreachable + false-positive blocklist
├── domains.yaml                 # canonical software-industry domain vocabulary
                                 # (picker source; validates registry/profile tags)
├── role-templates.yaml          # curated role searches (all roles) the picker
                                 # prefills into roles.yaml; every one is a valid role
├── sources.yaml                 # board definitions
└── categories.yaml              # category taxonomy: free strings, first match
                                 # in `order` wins, `fallback` when nothing hits
                                 # (profile can override the whole file)

profile/                         # GITIGNORED — personal
├── profile.yaml                 # name, enabled boards, companies, ui_prefs, resumes[].base
├── roles.yaml                   # role searches (titles/stack/weights/exclusions/geo/lane)
├── resumes/*.md                 # shown in UI drawer; ic/em bases for generation
├── RESUME_GENERATION_SKILL.md   # resume-gen rules · judge-rubric.md # JD fit rubric
└── archive/                     # original source documents
```

Domain vocabulary for the registry lives in `config/domains.yaml` (12 canonical
software-industry domains: `ai-ml fintech crypto cloud-infra devtools security
data saas gaming consumer ecommerce healthtech` — industry/function only;
geography is matched via roles' geo, not company domains). `loadCompanies()` =
registry ∩ profile.domains − exclude + include (src/config/load.ts).

**Setup is in-app**: a fresh install boots with `configured:false` (no/invalid
profile+roles) → the React onboarding wizard writes profile.yaml + roles.yaml
via `/api/settings`; the Settings overlay edits every profile/ artifact later.
Writes are **zod-validated with the SAME schemas the loaders use** (invalid
config rejected, never written) and **atomic** (temp+rename). There is NO
config cache — a written file is live on the next read. Personal `profile/`
only; committed `config/` is never edited from the UI.

## Architecture

```
CONFIG (yaml)                  SCRAPE PIPELINE (src/scraper/run.ts)
 config/sources.yaml            1 acquire lock (scrape_runs row, 60min TTL)
 config/companies.yaml     ──▶  2 each enabled source → RawJob[]
 profile/profile.yaml              boards: drop > max_age_days (dated only)
 profile/roles.yaml                ATS: NO age filter (open by definition)
                                3 dedupe: exact dedupe_key → fuzzy pass
                                4 rescore ALL active rows (matcher/*)
                                5 decay is_active (success-gated per source;
                                  3 consecutive 0-job "suspect" runs → accept)
                                6 complete run row
                                         │
                                SQLite data/jobs.db (WAL)
                                jobs · scrape_runs · source_state
                                         │ better-sqlite3 (sync, prepared stmts)
                                Express :3000 (src/server) — JSON error mw
                                /api/jobs /api/scrape /api/runs/latest /api/stats
                                /api/export.csv /api/resumes /api/config
                                /api/settings (in-app config editor)
                                /api/import (user-driven import) /api/demo (sample data)
                                + dist/ui
                                         │
                                React triage page (src/ui)
```

### Source adapter contracts

- Board: `{ id, fetch(ctx): Promise<RawJob[]> }` in `src/sources/boards/` + an
  entry in `config/sources.yaml`.
- ATS: `detect(careersUrl) → {provider, slug}` (greenhouse incl. `?for=` embed
  form, lever, ashby) + `fetch{Greenhouse,Lever,Ashby}` in `src/sources/ats/`.
- **Invariant:** ATS adapters write `source_id = 'ats:<provider>'` — the decay
  loop expands the aggregate `ats` result to exactly these ids.

### Dedup invariants (src/matcher/dedupe.ts) — the critical path

1. Same job on N boards = 1 row. 2. Triaged jobs NEVER resurface as new.

- Exact: `dedupe_key = sha1(norm_company|norm_title|geo_bucket)`; seniority
  synonyms collapsed; geo_bucket canonicalizes remote variants.
- Fuzzy (per first-token company candidates, indexed): core-title-token overlap
  ≥2 shared + ≥0.6; companies compatible when equal or word-boundary prefix
  ("tether" ↔ "tether operations" — NOT "modern treasury" ↔ "treasury prime").
  - candidate user-triaged → merge regardless of geo (suppression beats precision)
  - candidate `new` → merge only when geo buckets compatible. **Deliberate:**
    same title in Dubai vs London = two real roles, kept apart (tested).
- Merges keep most-advanced status (`STATUS_RANK`; rejected/dismissed tie on
  purpose), earliest first_seen, longest description; location never degrades.
- Normalized identity columns are frozen at insert (no drift under UNIQUE).

### Matching (src/matcher/matcher.ts)

- Hard filter per role: title keyword AND no title_exclude AND must-have stack
  term (word-boundary matched — 'node' ≠ 'anode') AND no exclude-term-as-primary
  ("primary" = first 250 chars / 3+ mentions / near required-phrasing, with
  negated mentions like "no Rust required" stripped first).
- Missing/short JD (<300 chars): match on title+tags; absent stack evidence →
  include with `stackUnverified` flag (CONTEXT rule: include with a flag, not
  exclude). Full JD without stack evidence → reject.
- Score: must-have (cap 20) + weighted nice_to_have (cap 30) + geo (15/10) +
  seniority title (10), normalized ×100/75; negatives subtract uncapped but a
  0-score match stays `is_match=1` (visible, deliberately).
- Rescore-all-active every run — config edits apply immediately.

### Reliability rules

- Source failures logged per-source, never fatal. 0 jobs from a previously
  productive source = `suspect` (decay skipped); 3 consecutive → accepted.
- posted_date NULL or stale → UI date filter ORs with first_seen ("recently
  posted OR recently discovered").
- **Refinement-on-new-only** (buildJobsFilter): score / recency / `match=matched`
  constrain `status='new'` rows ONLY — triaged jobs (interested/applied/…)
  always show when their status is selected, so a curated job never silently
  disappears for being low-score or old. `match=unmatched` stays global (audit).
- Role filter = IC/EM **lanes** (roles.yaml `lane: ic|em`); the UI sends the csv
  of role ids in a lane, server ORs `matched_role_ids LIKE`. /api/config drops
  excluded categories from the dropdown. /api/stats = **WYSIWYG** pipeline counts
  by status — it reuses `buildJobsFilter(query, {omitStatus})` and GROUPs BY
  status, so each pill's number equals what clicking it shows under the current
  refinements (the `new` count obeys the score/recency floor; triaged statuses
  stay full via the `OR status<>'new'` carve-out). When the list is empty ONLY
  because of the Score/Posted floor, the table shows a "Show them" rescue (clears
  those two filters) — counted via a cleared-filter `fetchJobs` total.
  List route `sort=score|date`; `location` is a substring filter. Manually-added
  jobs (no source_id) show a "manual" badge instead of a 0/✗ score.
- Scrape lock = `running` scrape_runs row; the DB lock is the ONLY running-state
  authority (no in-process flags). Self-healing via `Repo.failStaleRuns`: stale
  (>60 min) `running` rows are failed on the next `acquireScrapeLock` AND on the
  read path (`latestRun`), so the polling UI recovers on its own; **server
  startup** reconciles ALL `running` rows (an in-process scrape can't survive a
  restart/crash), so an orphaned run never strands the UI on a phantom "running".
- Corrupt JSON in a DB row degrades to defaults (safeJsonParse), never throws.

### Reviewed-and-REJECTED ideas (don't re-propose without new evidence)

- **hosted SaaS / serving non-technical users** — breaks all four wedges at once
  (free · keyless · private · un-bannable distributed scraping); the local-first
  delivery model IS the value. Deep PM research 2026-06-08; a different product.
- **scraping LinkedIn / Indeed / Naukri / X** — account bans, active LinkedIn
  litigation, killed/paid APIs, anti-bot maintenance treadmill; breaks the
  no-headless-browser design. Coverage of these comes via a user-driven local
  *import* endpoint (the user's own session), not server-side scraping.
- **going generic across ALL industries** — scope is the *software industry*
  (any role). Non-tech industries need different boards + non-self-host-capable
  users; out of scope.
- helmet/auth/rate-limiting — localhost single-user by design
- lock heartbeat — 60min TTL is 15× observed run time
- merging new-vs-new geo-distinct duplicates — they're usually real distinct roles
- `is_match=false` on 0 score — penalized jobs stay visible at score 0
- dist-compiled CLI in Docker — tsx-in-prod is the chosen tradeoff
- index tuning / composite list indexes — SQLite scans 50k rows in ms; single user
  (incl. the new `OR status <> 'new'` refinement clauses + `/api/stats` GROUP BY
  + role-csv LIKE ORs — all unindexed, all sub-10ms at 50k, accepted)
- streaming/paginating the rescore loop — rescore-all is the design
- making DEFAULT_FILTERS (score≥30/14d/new) configurable — product defaults,
  changeable in the UI with reset
- claude CLI in Docker via `claude setup-token` — host `npm start` already
  gives the full app + resume gen with Keychain auth; a long-lived token in
  .env isn't worth it for a single-user tool

### Resume generation (optional, host-only)

`src/resume/`: prompt assembly + output validation (em/en dashes are
auto-normalized to hyphens, never rejected — punctuation, not content;
forbidden terms from profile `resume_rules.forbidden_terms` (NDA names —
NEVER hardcoded in code), email/structure violations reject) → local `claude -p` CLI (user's subscription, stdin/stdout, tmpdir cwd,
180s timeout) → markdown parsed (`parse.ts`, structure contract = base resume
shape) → deterministic pdfkit renderer (`render-pdf.ts`, template ground truth
= the user's real resume PDF; one-page asserted). Output:
`profile/generated/<date>-<company>-<jobId>/{resume.md,resume.pdf,meta.json}`.
Capability via `GET /api/config` (CLI detection) — false in Docker, UI hides
the button. Key invariant: **LLM owns words, code owns layout** — never let
the model emit formatting, never let code paraphrase content. The `claude -p`
runner is shared (`src/llm/claude-cli.ts`), run from tmpdir so no project
CLAUDE.md/scaffolding loads. **Do NOT add `--bare`** — it bypasses the
subscription session and demands an API key (verified 2026-06-08).

### Fit-judge (optional, advisory — `src/judge/`)

Second-stage precision layer over the keyword matcher's recall. For matched
jobs, an LLM applies the user's `profile/judge-rubric.md` to the JD and returns
a **4-level overall verdict** (STRONG/DECENT/WEAK/SKIP) + reasons + hard-blocker
flags **+ a per-dimension breakdown** (`dimensions[]`: skills · seniority ·
domain · location · red_flags, each rated strong/ok/weak/unknown with a note and
1-2 JD evidence citations; stored as `llm_dimensions` JSON, guarded ALTER).
`parseDimensions` is defensive — drops unknown/duplicate keys, coerces bad
ratings to `unknown`, caps evidence (2×≤280ch), degrades junk/missing to `[]`
(so old verdicts and back-compat just work). (`prompt.ts` build/parse;
`backends.ts` claude-cli | openai-compatible — one fetch covers
OpenAI/Gemini/DeepSeek/OpenRouter/Ollama, JSON schema all-required to dodge
Gemini's compat optional-field bug, one JSON-repair retry). **Invariants:**
advisory ONLY — never gates/hides (chip + sort + sub-scores, like the unmatched
audit); verdict frozen per JD hash (`llm_judged_hash`; re-judged on JD change or
the Re-judge button — switching backends/shape does NOT auto-refresh); the
overall verdict/summary/reasons/blockers are unchanged so the chip+sort keep
working; `judgePending` is **best-effort** — a per-job/backend failure is logged
and skipped, NEVER fails the scrape or touches match/status. Config: profile
`llm.{backends,judge,resume}`; enabled via `llm.judge.enabled`. Keys in ENV
(`api_key_env`), never in yaml. CLI: `npm run judge [-- --all|--id N]`.
**Privacy:** resume gen must use a non-training backend (paid/local); free judge
tiers (train on input) are fine for semi-public job data only. Model-choice
guide: `docs/model-tradeoffs.md`.

## Commands

```bash
npm run scrape [-- --source X]   # scrape (lock-guarded; UI button same path)
npm run judge [-- --all|--id N]  # optional fit-judge over matched jobs
npm run dev | build | start      # UI dev / production
npm test                         # vitest — 251 tests
```

## Status

v1 complete + post-review hardening (2026-06-06): 7 build phases, dual
line-by-line review (50 findings triaged), community-registry restructure.
Live: ~2,900 active jobs from 5 source families and 112 company boards.

**v2 — software-industry pivot (2026-06-08), 7 phases, per-phase review +
security-review, all pushed:** repositioned to the software industry / all roles
(`config/domains.yaml`, 21 `config/role-templates.yaml`); profile-level location;
new sources Recruitee (ATS), We Work Remotely (RSS) + Himalayas (JSON);
multi-dimension fit-judge with JD evidence citations; AI-first reframe +
`docs/model-tradeoffs.md`; `POST /api/import` (user-driven, non-scraped sites) +
`docs/importing-jobs.md`; onboarding redesign (domain multiselect, role-template
picker, location, model setup); in-app sample data (`/api/demo`). vitest — 251
tests. (Fixed en route: committed `categories.yaml` fallback escaped the loader
schema — now guarded.)

## v2+ roadmap (architecture accommodates, zero code today)

Telegram channels, liveness/expiry classifier, cover-letter tooling, N+1 ATS
adapters (SmartRecruiters/Workable/Workday via title-gated JD enrichment), and a
browser-extension capture flow for the import endpoint (design-gated).
(LLM fit-judge, multi-source expansion, user-driven import — shipped above.)

**Matching-accuracy ideas (architecture accommodates; nothing built):**
- *Registry-domain category hints* — category is inferred from JD text, which
  mislabels e.g. payments firms as `defi`. For ATS jobs we already know the
  company's `config/companies.yaml` domains: thread an optional `categoryHint`
  through `RawJob`, set it from registry domains (first match in category order),
  prefer it over keywords; persist as a column so rescore stays idempotent.
  ~½ day; fixes the whole ATS category facet (~70% of corpus).
- *Feedback-driven score calibration* — triage already labels data
  (`applied/interested` = positive, `dismissed` = negative) with matched
  keywords. A `npm run calibrate` could print per-keyword lift vs baseline and
  suggest `nice_to_have` weight changes; deliberately a suggestion-printer, not
  an auto-tuner (weights stay human-owned in config). Needs ~50+ decisions.

- Recruitee: `GET https://{slug}.recruitee.com/api/offers/`
- SmartRecruiters: `GET https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100&offset=N&status=PUBLIC`
- Workable: `GET https://apply.workable.com/{slug}/jobs.md` (markdown table)
- Teamtailor: `GET https://{slug}.teamtailor.com/jobs.rss`  ← unlocks Reap + Crossmint
- Workday: `POST https://{co}.{shard}.myworkdayjobs.com/wday/cxs/{co}/{site}/jobs`
  body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`
- Greenhouse EU (`boards.eu.greenhouse.io`) — public API requires auth; needs research

### Current ATS endpoints (in use)

- Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`
- Lever: `GET https://api.lever.co/v0/postings/{slug}?mode=json`
- Ashby: `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` (30s timeout; slugs case-sensitive)
- jobstash: `GET https://middleware.jobstash.xyz/jobs/list?page=N&limit=M`
