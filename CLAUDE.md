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
with no model. Ships with a committed, domain-tagged registry of 569
live-verified company boards across all 12 domains. Single user, local-first
(`npm start`; reproducibility via `.nvmrc` + `package-lock.json`).
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
  (roles/sources/categories) comes from `GET /api/config`, never constants. The
  fixed status vocabulary is the one exception: `JOB_STATUSES` in
  `src/shared/types.ts` is the single source (server CSV validation + UI status
  pickers + bulk actions all import it; `JudgeVerdict` lists come from
  `JUDGE_VERDICTS`) — never re-list the strings.
- Deliberate cuts: no LLM, no caching layer, no queue, no Playwright, no auth,
  no migrations framework — additive ALTERs guarded inline in the v1 baseline,
  plus a tiny PRAGMA-user_version runner (`migrate()`) for changes a long-lived
  DB needs after v1 was stamped (v2 = scrape-progress columns).
- Polite scraping: fixed UA, sequential sources, per-host delays (ATS APIs get
  faster 0.5-1.5s pacing), 10s timeout, retries w/ backoff, 30/60/120s on
  429/503 (fail-fast on last attempt), host allowlist for ATS fetchers AND
  board fetchers (each board adapter is host-scoped to its `base_url` via
  `scopeHttp`; the manual redirect-follow re-checks the allowlist at every hop,
  so a 3xx can't bounce the request to an internal/LAN address — SSRF guard).
- All date stamps (first_seen/last_seen/decay cutoffs) use the **local**
  timezone (`localDateISO`) — UTC would mislabel "today" for non-UTC users.

## Config layout (post community-registry restructure)

```
config/                          # COMMITTED — community value
├── companies.yaml               # registry: name + careers_url + domains tags
│                                # (researched-but-unreachable companies + the
│                                #  false-positive blocklist live in docs/companies-unsupported.md)
├── domains.yaml                 # canonical software-industry domain vocabulary
                                 # (picker source; validates registry/profile tags)
├── role-templates.yaml          # curated role searches (all roles) the picker
                                 # prefills into roles.yaml; every one is a valid role
├── sources.yaml                 # board definitions
└── categories.yaml              # category taxonomy: free strings, first match
                                 # in `order` wins, `fallback` when nothing hits
                                 # (committed-only — no profile override)

profile/                         # GITIGNORED — personal
├── profile.yaml                 # name, enabled boards, companies, ui_prefs, resumes[]
├── roles.yaml                   # the single role search (titles/stack/weights/exclusions/geo)
├── resumes/*.md                 # shown in UI drawer; the base for resume generation
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
The Settings **AI/LLM tab** is a friendly form over the profile `llm` block
(backend engine claude-cli|openai-compatible with model/base_url/api_key_env,
judge enabled toggle + min_score floor, a "Detected claude CLI: yes/no" line from
`/api/config` `claudeAvailable`) — it builds a snake_case `llm` block via the pure
`buildLlmBlock` and writes the FULL profile through the same validated PUT
/profile (no new write path; openai fields hidden unless that engine is picked).
Writes are **zod-validated with the SAME schemas the loaders use** (invalid
config rejected, never written) and **atomic** (temp+rename). There is NO
config cache — a written file is live on the next read. Personal `profile/`
only; committed `config/` is never edited from the UI. Every fs route
(resumes/resume-gen/settings) confines paths through the **shared** boundary
guard `src/config/paths.ts` (`safeProfilePath`/`safeProfileSubpath`: reject `..`
escapes AND the dir root itself) — one implementation, no per-route drift.

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
                                /api/demo (sample data)
                                + dist/ui
                                         │
                                React triage page (src/ui)
```

### Source adapter contracts

- Board: `{ id, fetch(ctx): Promise<RawJob[]> }` in `src/sources/boards/` + an
  entry in `config/sources.yaml`.
- ATS: `detect(careersUrl) → {provider, slug}` (greenhouse incl. `?for=` embed
  form, lever, ashby, recruitee, workable, teamtailor, personio, breezy, pinpoint,
  smartrecruiters — 10 providers) + a `fetch<Provider>` per provider in `src/sources/ats/` (the
  `FETCHERS` map in `index.ts`).
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
  productive source = `suspect` (decay skipped); 3 consecutive → accepted. The
  aggregate `ats` source applies the SAME rule (mirroring the board path, same
  repo state): an all-empty-but-not-all-errored ATS run is `suspect`, so one
  fluke can't deactivate the prior ATS corpus; 3 consecutive accept 0.
- posted_date NULL or stale → UI date filter ORs with first_seen ("recently
  posted OR recently discovered").
- **Refinement-on-new-only** (buildJobsFilter): score / recency / `match=matched`
  constrain `status='new'` rows ONLY — triaged jobs (interested/applied/…)
  always show when their status is selected, so a curated job never silently
  disappears for being low-score or old. `match=unmatched` stays global (audit).
- **Single role** (no lanes/role filter): the profile carries ONE role search;
  `matched_role_ids` is still stored (a job either matches it or not) but the UI
  exposes no role/source facet. `category` is a plain equality filter; its
  dropdown vocabulary comes from /api/config (the full taxonomy — no
  exclude-categories carve-out). /api/stats = **WYSIWYG** pipeline counts
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
- Scrape progress: the `running` row carries live `sources_done`/`sources_total`/
  `current_source` (v2 migration; the unit = each ATS company board + each
  non-ats board). `runScrape` updates them incrementally (throttled, best-effort —
  a status-write failure NEVER aborts a scrape; `fetchAtsCompanies` fires a
  per-company `onProgress`), `completeRun` writes the authoritative final
  `sources`/`total_new` and clears `current_source`. `latestRun` surfaces them so
  RunStatusStrip shows "Scraping… 40/120 sources · N new" (the polling UI already
  refetches every 2s); the "~570 boards, runs in the background" hint is a quiet
  hover-tooltip (ⓘ) on the running pill, not a banner. **The scrape does NOT run
  the judge** (v6 decoupling) — scrape stays isolated and judging is a separate,
  user-initiated action (see the fit-judge section); the old in-scrape
  `judge:done/total` progress sentinel was removed. Crash-safety unchanged (the
  orphan reconciliation still owns running-state).
- Corrupt JSON in a DB row degrades to defaults (safeJsonParse), never throws.

### Reviewed-and-REJECTED ideas (don't re-propose without new evidence)

- **hosted SaaS / serving non-technical users** — breaks the core wedges at once
  (free · keyless · private · runs on the user's own machine); the local-first
  delivery model IS the value. Deep PM research 2026-06-08; a different product.
- **sources that require a logged-in session or a real browser** — out of scope by
  design (the no-headless-browser, public-API-only architecture). A user-driven
  import (a `/api/import` endpoint + paste UI + a browser-extension harvest prompt)
  was BUILT and then fully REMOVED on 2026-06-09. Verdict: the extension couldn't
  reliably extract full JDs at volume (context/output-budget drops the description
  field; long-task instability stalls it), the email-parsing alternative adds
  ongoing upkeep for thin marginal coverage now that the registry is 560+ companies
  plus the boards, and a generic JSON importer pushes a hard formatting burden onto
  the user. Net: not worth the surface area. **Don't re-propose without materially
  new evidence** (e.g. an official public API).
- **going generic across ALL industries** — scope is the *software industry*
  (any role). Non-tech industries need different boards + non-self-host-capable
  users; out of scope.
- helmet/auth/rate-limiting — localhost single-user by design
- lock heartbeat — 60min TTL is 15× observed run time
- merging new-vs-new geo-distinct duplicates — they're usually real distinct roles
- `is_match=false` on 0 score — penalized jobs stay visible at score 0
- compiling the server to dist/ — `tsx`-in-prod (server + CLI both run from src)
  is the chosen tradeoff; only the UI is bundled (Vite). `tsc --noEmit` typechecks.
- Docker — removed (v3): the resume-gen + judge features need the host `claude`
  CLI and can't run in a container; reproducibility comes from `.nvmrc` +
  `package-lock.json`. May return for a NAS/headless-only build later.
- index tuning / composite list indexes — MOSTLY still true (the `OR status <>
  'new'` refinement clauses, `/api/stats` GROUP BY, role-csv LIKE ORs stay
  unindexed, all sub-10ms — accepted). EXCEPTION (v7, evidence-based): the list
  route's default `ORDER BY match_score DESC` was temp-b-tree-sorting the whole
  filtered set AND its COUNT was table-looking-up ~16k rows to evaluate the
  status/is_match residuals (`new` is ~99% of active rows) — measured 58-107ms,
  NOT "ms". One COVERING index — `idx_jobs_active_score (is_active, match_score
  DESC, status, is_match)` (schema v4) — index-orders the sort (early LIMIT
  termination) AND makes the COUNT index-only → ~2-4ms end-to-end. Don't add MORE
  without the same kind of measured win.
- streaming/paginating the rescore loop — rescore-all is the design
- making DEFAULT_FILTERS (score≥30/14d/new) configurable — product defaults,
  changeable in the UI with reset

### Resume generation (optional, host-only)

`src/resume/`: prompt assembly + output validation (em/en dashes are
auto-normalized to hyphens, never rejected — punctuation, not content;
email/structure violations reject) → local `claude -p` CLI (user's subscription, stdin/stdout, tmpdir cwd,
180s timeout) → markdown parsed (`parse.ts`, structure contract = base resume
shape) → deterministic pdfkit renderer (`render-pdf.ts`, template ground truth
= the user's real resume PDF; one-page asserted). Output:
`profile/generated/<date>-<company>-<jobId>/{resume.md,resume.pdf,meta.json}`.
Capability via `GET /api/config` (CLI detection) — false when the `claude` CLI
is absent, UI hides the button. Key invariant: **LLM owns words, code owns layout** — never let
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
and skipped, NEVER touches match/status. **Score floor:**
`llm.judge.min_score` (default 50) gates the "Judge jobs" run to matched jobs at
or above that keyword score — the LLM is the costly layer. The explicit Re-judge
`ids` path AND the `--all`/`--id` CLI bypass the floor (per-job intent). The
floor is deliberately low: the matcher score only weakly predicts the verdict
(STRONG verdicts appear as low as ~56), so a high floor would starve real fits —
which is exactly why the judge exists as a second layer. The UI flags
**score↔verdict divergence**: a matched job with `match_score≥70` but a SKIP/WEAK
verdict gets an amber score ring + warning dot + the top blocker inline, so a
green-looking score next to a SKIP chip is self-explanatory, not confusing.
Config: profile `llm.{backends,judge,resume}`; enabled via `llm.judge.enabled`.
Keys in ENV (`api_key_env`), never in yaml. CLI: `npm run judge [-- --all|--id N]`.
**User-initiated only (v6):** the scrape no longer auto-judges — judging is
always an explicit user action so the user opts into the LLM cost (not everyone
wants to judge every batch). `judgePending` logs per-job `judge X/Y: Company →
VERDICT` and takes an `onProgress(done, total)` hook. The **"Judge jobs" button**
(`POST /api/judge/pending`) judges the un-judged backlog ≥ floor in the
background; clicking it first shows a **confirm with the estimated token cost**
(`estimateJudgeRun`). `GET /api/judge/status` ({enabled, pending, running, done,
total, failed}) drives the button label + "Judging X/Y" progress (UI polls it;
the button hides when nothing is pending; the pending count refreshes when a
scrape completes). Run state is in-memory and intentionally un-persisted: written
verdicts survive a crash, and the un-judged remainder is just re-offered — the
floor-gated `judgePending` skips fresh verdicts, so it's resumable by clicking
again (a scrape-in-progress 409s it).
**Privacy:** resume gen must use a non-training backend (paid/local); free judge
tiers (train on input) are fine for semi-public job data only. Model-choice
guide: `docs/model-tradeoffs.md`.

## Commands

```bash
npm run scrape [-- --source X]   # scrape (lock-guarded; UI button same path)
npm run judge [-- --all|--id N]  # optional fit-judge over matched jobs
npm run dev | build | start      # UI dev / production
npm test                         # vitest — 333 tests (9 skip without a profile resume)
```

## Status

v1 complete + post-review hardening (2026-06-06): 7 build phases, dual
line-by-line review (50 findings triaged), community-registry restructure.
Live (v1 snapshot): ~2,900 active jobs. Current registry: 569 company boards
across 12 domains + 5 job-board adapters + 10 ATS providers (see the v3 note below).

**v2 — software-industry pivot (2026-06-08), 7 phases, per-phase review +
security-review, all pushed:** repositioned to the software industry / all roles
(`config/domains.yaml`, 21 `config/role-templates.yaml`); profile-level location;
new sources Recruitee (ATS), We Work Remotely (RSS) + Himalayas (JSON);
multi-dimension fit-judge with JD evidence citations; AI-first reframe +
`docs/model-tradeoffs.md`; onboarding redesign (domain multiselect, role-template
picker, location, model setup); in-app sample data (`/api/demo`). (A user-driven
session import was built then removed in v3 as incomplete — deferred to a
future version.)

**v3 — post-fresh-run remediation (2026-06-09), per-phase review + checks, local
commits (unpushed):** fixed the headline scoring bug (the onboarding wizard
dropped the role template's `nice_to_have`/excludes → every job capped at 60/100;
now carried via a unit-tested `buildRoleEntry`, browser-validated — and the SAME
cap on the **custom-role** path (no template → no nice_to_have) is fixed too:
`buildRoleEntry` now synthesizes a modest nice_to_have from the user's stack (+ an
optional comma-separated "nice to have" field in the onboarding custom block), so
a custom role scores 0-100, not 0-60); expanded the
registry **113 → 328 companies** across all 12 domains (was 7 empty), global +
India/MENA, incl. famous names (OpenAI, Anthropic, Snowflake, Coinbase, …) with
unscrapeable giants documented in `docs/companies-unsupported.md`; **role templates
21 → 40** grouped by function (with deepened keyword coverage); registry +
role-templates restructured by
domain/function with clean comments; onboarding reworked (two-level role picker,
location chips, AI step dropped — judge/resume OFF by default); removed the v2
import feature; snappier filters (debounce only search typing). **Validation
scrape (13.6k jobs):** max match score now **85** (was capped at 60); matched
jobs **diverse** (crypto 12%, ai-ml 23%, devtools 16%, data 14% … all 12 domains
— was 57% crypto). REMAINING (deferred): opt-in LLM-assisted AI setup (judge
rubric + resume skill), friendlier Settings forms.

**Final hardening pass (2026-06-09, after a fresh judged run):** added the
`llm.judge.min_score` auto-run floor (default 50) + the score↔verdict divergence
UI cue; fixed a matcher false-positive (bare `backend` / incidental lone
"JavaScript" was inflating Java/Spring roles to 80-100 — the EM lane required a
real JS-family token + JVM anti-signals; that lane-specific path was removed with
lanes in v4); verified the backup→current
status migration lost no source-backed triage data; comment cleanup (dropped
dated curation/process noise, kept reasoning + navigation). Dual final review
(code + security): zero HIGH/regressions, ship-approved. A UX review flagged 3
deferred P0s for a future pass — judge/LLM not enableable from the UI (YAML-only),
the custom-role path still caps score at 60 (template path was fixed in v3), and
the multi-minute scrape gives no progress feedback. **(All three resolved in v4.)**

**v4 — single-role redesign (2026-06-10, branch `single-role-redesign`,
unpushed):** collapsed the product to ONE role — removed IC/EM lanes, the
role/source triage filters, `exclude_categories`, the resume `base: ic|em`, and
`resume_rules`/`forbidden_terms` (no invisible YAML hatch; existing matched rows
re-match against the single role on the next scrape). Closed the 3 deferred P0s:
judge + resume gen are now enableable from the UI (the AI/LLM Settings tab —
mandatory backend + a cheap connection check), the scrape/judge phases stream
live progress AND are user-cancellable (stop controls), and a "Judge jobs" button
clears the un-judged backlog. Settings de-YAML'd into forms (Categories tab
removed). Resume ingestion: upload `.docx`/`.pdf` (mammoth/pdfjs, zip-bomb +
size-guarded) → an LLM auto-authors the judge rubric + resume-gen rules from the
resume, refinable by prompt. Removed the import feature's last traces. Registry
569 companies / role-templates 66. **Security:** judge-backend SSRF/exfil guard
at BOTH write-time (profileSchema `superRefine`) and runtime
(`checkLlmBaseUrl`/`checkApiKeyEnv` + `redirect:'manual'`), a v3 judge-column
backfill migration (v2-stamped DBs were missing the `llm_*` columns), and a
scrape-lock race fix (`.immediate()` txn). Tests 331; dual code+security audit,
ship-approved.

**v5 — AI config-tuning + cost optimization (2026-06-11, branch
`w2-cost-optimization`, unpushed):** extended the v4 resume→rubric/skill authoring
(`src/authoring/`) to also draft **`roles.yaml` and `profile.yaml`** from the
resume — structured JSON validated against the SAME `rolesFileSchema`/`profileSchema`
the loaders use (bad drafts rejected, never saved), one repair retry, with the
template's `title_keywords` preserved and the role `id` locked. New routes
`/api/settings/generate-roles` + `/generate-profile` (share the `llmBusy` lock);
Settings Roles/Profile tabs get **Generate / Fine-tune** buttons (guided
placeholders) + a confirm-before-overwrite guard; the existing rubric/skill tabs
get the same explicit Fine-tune button. A one-time **AI intro popup**
(`AiIntroDialog` + `src/shared/llm-costs.ts`) introduces the AI features with
per-feature token estimates; a guided "Tune your matching with AI" hub appears in
the AI tab once a backend is set. **Cost (W2):** per-feature **model routing** —
`llm.judge.model` (cheap, e.g. Haiku) + `llm.resume.model` (stronger, e.g. Sonnet;
also the "writing" model for authoring), blank → backend/CLI default — threaded
through the judge runner, resume generator, and authoring; Settings AI tab gains a
Model-routing section + a pre-run "~N jobs ≈ ~XK tokens" estimate. Rubric
prompt-caching deliberately deferred (API-only). Removed the redundant Settings
template picker; `.env` now loads via `--env-file-if-exists` (Node ≥20.12). Tests
351; dual code+security review (no HIGH/MEDIUM; 2 LOW + 1 MEDIUM robustness fixed).

**v6 — scrape/judge decoupling (2026-06-11, branch `decouple-judge-from-scrape`,
unpushed):** the scrape no longer auto-runs the fit-judge. Judging is always a
**user-initiated** action (the "Judge jobs" button → `POST /api/judge/pending`),
and clicking it first shows a **token-cost confirm** (`estimateJudgeRun`) so the
user opts into the LLM spend — not everyone wants to judge every batch. The
in-scrape judge phase + its progress sentinel (`judgeProgressLabel`/
`parseJudgeProgress` and the RunStatusStrip "Judging fit…" branch) were removed;
scrape stays fully isolated, and the button's pending count refreshes when a
scrape completes. Tests 348 (the judge-progress unit test went with the helpers).

**v7 — triage-UX + matching fixes (2026-06-11, unpushed):** a batch of
user-reported fixes. **Triage:** the note-on-status-change popover was removed —
status changes apply immediately and the row settles (auto-leaves a view it no
longer matches) at once; a note can still be added from the expanded row. The JD
excerpt was dropped from the expanded row (use "Open JD" — a truncated excerpt
helped no one). The expanded row's "age" now shows "discovered Nd ago" off
first_seen when an ATS stamps an implausibly-old posted_date (an evergreen 2021
repost rendered as "1870d ago"). **Filters:** picking the **All** status pill now
applies the score/recency floor **globally** (no new-only carve-out) — both the
list and `/api/stats` read `status` in `buildJobsFilter`, so the All-pill total
stays WYSIWYG (other statuses keep the carve-out so curated jobs never vanish).
`/api/jobs` emits a `Server-Timing: db` header + logs slow (>25ms) queries to
locate filter-switch lag. A Settings save now also refreshes the judge backlog
count (changing the judge floor updates the "Judge jobs" pending number). **AI:**
the **Profile fine-tune** feature was removed entirely (route `/generate-profile`,
`generateProfileDraft`/`buildProfilePrompt`/`parseProfileDraft`, UI bar — it only
authored domains+geo, trivial checkbox work); the **Roles** fine-tune now stages
its draft as a reviewable **diff** (added/removed keywords + weight changes) the
user explicitly Applies, instead of silently overwriting the form. **Settings UX:**
"Close" → "Back to triage"; number inputs use a string-state `NumField` (the old
coerce-every-keystroke input forced "050" and couldn't be emptied). **Config (this
profile, gitignored):** Himalayas dropped from `enabled_sources` (294 active jobs,
3 matched, 0 ≥50 — its adapter stays committed for others); the active
`roles.yaml` gained leadership `title_exclude`s (manager/director/head of/vp) and
dropped bare `engineer`/`backend` catch-alls that were leaking 51 Engineering-
Manager jobs into the IC search. Verified live: judge→`haiku`, resume→`sonnet`
aliases resolve through `claude -p --model`; the roles fine-tune preserves all
title_keywords and adds value via nice_to_have weights + excludes.
**Dedupe false-merge fix:** the fuzzy-dedupe geo stopword list was missing
`europe` (+ many regions/countries/cities), so a shared location token in a title
suffix inflated overlap and merged DIFFERENT roles — "Backend Engineer (Europe)"
was merging into "Site Reliability Engineer (Europe)" at Trigger.dev and getting
hidden (the SRE title then title-excluded the row). `TITLE_STOPWORDS`
(`normalize.ts`) was expanded; +2 dedupe regression tests. Surfaces on the next
scrape (dedupe is insert-time). **List-route perf:** the default `match_score
DESC` sort was temp-b-tree-sorting the filtered set, and its COUNT was
table-looking-up ~16k rows for the status/is_match residuals (`new` ≈ 99% of
active) — 58-107ms in the `Server-Timing`/slow-query logs. Added a COVERING index
`idx_jobs_active_score (is_active, match_score DESC, status, is_match)` (schema v4)
→ ~2-4ms end-to-end (sort index-ordered + count index-only); dropped the
now-unused 600-char `description_excerpt` from the list payload (the JD excerpt
was removed from the row in this same v7). The diagnostic slow-query console log
was removed once fixed; the silent `Server-Timing: db` header stays.
Tests 344 (profile-authoring tests removed with the feature; +1 All-pill, +2
dedupe regression tests).

## v2+ roadmap (architecture accommodates, zero code today)

Telegram channels, liveness/expiry classifier, cover-letter tooling, the Workday
adapter (per-company {shard,site} discovery + N+1 JD) and SmartRecruiters
title-gated JD enrichment (the SmartRecruiters/Workable list adapters now ship), a
**user-driven session import** (paste/extract from your own session +
optional browser-extension capture — design-gated; the v2 attempt was removed).
(LLM fit-judge, multi-source expansion — shipped above.)

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

- Workday: `POST https://{co}.{shard}.myworkdayjobs.com/wday/cxs/{co}/{site}/jobs`
  body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` (needs per-company {shard,site} discovery + N+1)
- Greenhouse EU (`boards.eu.greenhouse.io`) — no public EU API (`boards-api.eu…` is NXDOMAIN; EU board is a JS SPA) → user-import only

### Current ATS endpoints (in use)

- Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`
- Lever: `GET https://api.lever.co/v0/postings/{slug}?mode=json`
- Ashby: `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` (30s timeout; slugs case-sensitive)
- Recruitee: `GET https://{slug}.recruitee.com/api/offers/`
- Workable: `GET https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true` (JSON, full JD inline — NOT the older `/jobs.md` stub)
- Teamtailor: `GET https://{slug}.teamtailor.com/jobs.rss` (RSS; full JD in `<description>` CDATA; the whole subdomain incl. region label like `crossmint.na` is the slug)
- Personio: `GET https://{slug}.jobs.personio.com/xml` (XML; JD in `<jobDescription>` CDATA)
- Breezy: `GET https://{slug}.breezy.hr/json` (list-only — no public per-job JD; title+location → matcher short-JD path)
- Pinpoint: `GET https://{slug}.pinpointhq.com/postings.json` (JSON; JD + salary inline; no posted date → first_seen governs)
- SmartRecruiters: `GET https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100&offset=N` (paginated; case-sensitive slug; salary in customField; **list-only — no JD**, title-gated N+1 enrichment is a future step; careers_url is `jobs.smartrecruiters.com/{Slug}`)
- jobstash: `GET https://middleware.jobstash.xyz/jobs/list?page=N&limit=M`
