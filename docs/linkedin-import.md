# LinkedIn import — design

Status: **Phases 1-2 implemented** (2026-06-09) — core import + paste (§7 P1) and
the config-generated prompt (§7 P2). Phases 3 (token-gated direct POST) and 4
(liveness/ghost-job) are deferred. Owner-finalized decisions are in §3.

## 1. Goal & non-goals

**Goal.** Let the user pull LinkedIn job postings into jobctl so they flow
through the same pipeline as scraped jobs — dedupe → keyword match/score →
optional LLM fit-judge → status tracking — **without jobctl's server ever
contacting linkedin.com**.

**Non-goals.**
- No server-side LinkedIn scraping, ever (bans, active litigation, killed APIs,
  anti-bot treadmill — see CLAUDE.md "reviewed-and-REJECTED ideas").
- No headless browser owned by jobctl (breaks the no-Playwright design).
- No LinkedIn login, cookies, or credentials handled by jobctl.
- No scheduled/background LinkedIn traffic.
- Not building or maintaining a bespoke DOM-scraping bookmarklet.

## 2. Principle & threat model

The user's **own browser, own logged-in session** does all LinkedIn contact via
the **Claude Chrome extension**. Auth, rendering, and page-visiting happen
client-side as the user — from LinkedIn's perspective it's a human browsing.
jobctl only ever receives an already-extracted, normalized JSON payload on
`localhost`. This moves every rejection reason off jobctl's infrastructure:
no server IP to ban, no scraping for LinkedIn to litigate against us, no API to
be killed. Residual ToS risk (automated access) sits on the user's account and
is mitigated by manual-trigger + strict anti-bot pacing (see §3, §6). Confirmed
industry-consistent: the larger `career-ops` app also never scrapes LinkedIn —
it falls back to manual paste, with no session-import at all.

## 3. Finalized decisions

| # | Decision | Choice |
|---|---|---|
| Q1 | **Extraction depth** | Full **"About the job"** JD per posting. The set is kept small by front-loading filtering into the LinkedIn search itself (top keywords + preferred locations + ≤14 days). Our matcher + judge re-score precisely on our side; the LinkedIn search is only a coarse pre-filter. |
| Q2 | **Transport** | One shared `POST /api/import`. **Paste fallback** (same-origin UI box, no token). **Token-gated carve-out** of the cross-origin guard for the extension's `chrome-extension://` origin. |
| Q3 | **Cadence** | Strictly **manual / user-initiated**. No scheduler. User must be present to catch a LinkedIn challenge. |
| Q4 | **Extractor** | **Claude extension only.** Paste/`import` is the tool-agnostic fallback. **No bookmarklet.** The config-generated **prompt** is the owned, versioned asset. |

## 4. Architecture

```
roles.yaml (keywords) + profile.yaml (geo_priority)
        │
        ▼
 PROMPT GENERATOR ──► copyable Claude-extension prompt
 (keywords + locations + ≤14d + anti-bot rules + "extract About-the-job")
        │
   user runs it in the Claude Chrome extension (their own LinkedIn session)
        │  extracts a small, pre-filtered set of jobs WITH full JD
        ▼
   normalized JSON payload  ──────────────►  POST /api/import
        │  (a) paste into UI box (same-origin)      │
        │  (b) extension POST + token (carve-out)    │
        ▼                                            ▼
                                 map → RawJob[] (sourceId='import:linkedin')
                                            │
                                 ingestBatch(): dedupe → match/score → categorize → insert
                                            │  (fuzzy dedupe MERGES a LinkedIn repost
                                            │   with the same job already scraped from its ATS)
                                            ▼
                                 SQLite jobs  →  triage UI (scored, tracked)
                                            │
                                 LLM fit-judge runs on matched rows (JD present)
```

Reuses the existing `ingestBatch(repo, raws, roles, categories, log, excludeCategories)`
verbatim — so imported jobs get dedupe, scoring, categorization, tracking, and
judging with **no new pipeline code**.

## 5. Components

### 5.1 Import payload (the stable contract)
The JSON the extension/paste produces. Deliberately a small, tool-agnostic
shape; anything that emits it works.

```jsonc
{
  "source": "linkedin",            // → stored as source_id "import:linkedin"
  "jobs": [
    {
      "title": "Senior Backend Engineer",
      "company": "Acme",
      "location": "Dubai, UAE",          // raw string, as LinkedIn shows it
      "url": "https://www.linkedin.com/jobs/view/123456789",  // canonical; tracking params stripped server-side
      "description": "About the job\n…", // the full About-the-job text (required for a real verdict)
      "workMode": "remote",              // remote|hybrid|onsite|unknown (optional → unknown)
      "salaryText": "…",                 // optional
      "postedRelative": "2 weeks ago",   // OR postedDate "yyyy-mm-dd"; server parses relative → absolute (local tz)
      "externalId": "123456789"          // optional; defaults to the LinkedIn job id parsed from url
    }
  ]
}
```

### 5.2 `POST /api/import`
- Zod-validate the payload (reject malformed; cap array length, e.g. ≤500).
- Map each entry → `RawJob`: `sourceId='import:linkedin'`, `externalId` = given
  or parsed LinkedIn job id, `url` normalized (strip `?…` tracking params),
  `postedDate` = `postedDate` or `localDateISO(parsePostedDate(postedRelative))`,
  `tags=[]`, `workMode` default `'unknown'`.
- `loadRoles()/loadCategories()/loadProfile()` → `ingestBatch(...)`.
- Response: `{ received, inserted, merged }` — `inserted` = brand-new rows;
  `merged` = `received - inserted` (entries that deduped into an existing job,
  incl. a LinkedIn repost of an already-scraped ATS role, or an intra-batch dup).
- Best-effort optional: kick `judgePending` for the new matched rows (or leave
  it to the existing judge button / next judge run — judging is advisory).

### 5.3 Token + origin-guard carve-out
- jobctl generates a random token on first need, stores it under `profile/`
  (gitignored), and displays it in Settings ("LinkedIn import token").
- The cross-origin guard (`src/server/index.ts`) currently 403s non-local
  Origins on mutating routes. Carve out **only** `/api/import`: allow it when a
  valid `Authorization`/token header is presented, regardless of Origin.
  Same-origin paste needs no token (passes the guard already).
- Stays localhost-bound; the token prevents a random web page from POSTing.

### 5.4 Prompt generator
Builds the Claude-extension prompt from the user's config:
- **keywords** from `roles.yaml` (title keywords / must-have terms),
- **locations** from `profile.yaml` `geo_priority`,
- **≤14-day** recency filter,
- instruction to **open each matching posting and extract the About-the-job
  section** and emit the §5.1 JSON,
- **anti-bot rules** (§6): slow, randomized pacing; one posting at a time; a
  hard per-session cap; **abort and report on any LinkedIn challenge** (captcha,
  "unusual activity", verify/login wall).
Surfaced in the UI as copyable text (and regenerated when config changes).

### 5.5 UI
- App-bar **"Import from LinkedIn"** → a modal with: (1) the copyable generated
  prompt, (2) a **paste box** for the returned JSON, (3) the token (for the
  extension path) shown/managed in Settings.
- Imported jobs carry `source_id='import:linkedin'` → they ARE keyword-scored
  (NOT the "manual" no-source badge). Add a small **"linkedin"** source badge
  (the existing source-id chip already renders `job.source_id`).

## 6. Security & safety
- **No credentials** touch jobctl; the user's session never leaves their browser.
- **Token** gates the cross-origin import path; everything else stays behind the
  existing localhost bind + origin guard. Token in gitignored `profile/`, never
  in committed code or any response beyond the Settings display.
- **Anti-bot discipline** lives in the generated prompt: human-paced, capped,
  one-at-a-time, abort-on-challenge. Manual trigger only.
- **Untrusted input:** the payload is scraped third-party data → same treatment
  as scraped jobs (URL `isHttpUrl` guard at ingest + render, safe-JSON, zod
  validation, body size cap). No `dangerouslySetInnerHTML`.
- **ToS honesty:** documented as user-driven assisted browsing of one's own
  account; low-volume, manual. We don't promise it's risk-free.

## 7. Build phases (for approval)

**Phase 1 — Core import + paste (makes the feature usable end-to-end).**
`/api/import` endpoint + zod payload schema + LinkedIn→RawJob mapping (incl.
relative-date parsing) + `ingestBatch` wiring + the UI paste box. Source badge.
Tests: payload validation, mapping, dedupe-merge-with-ATS, bad-input 400.
→ Deliverable: paste a JSON blob, jobs appear scored/tracked/judgeable.

**Phase 2 — Prompt generator.**
Generate the Claude-extension prompt from `roles.yaml` + `geo_priority` + ≤14d +
anti-bot rules; show it (copyable) in the import modal; regenerate on config
change. Tests: prompt contains the user's keywords/locations + the anti-bot caps.
→ Deliverable: one-click prompt to hand to the Claude extension.

**Phase 3 — Token-gated direct POST.**
Token generate/store/display in Settings; origin-guard carve-out for `/api/import`
when the token is valid. Tests: cross-origin without token → 403; with token →
200; same-origin paste still works tokenless.
→ Deliverable: the extension POSTs directly, no copy-paste.

**Phase 4 — (future, optional, separate) liveness + ghost-job signals.**
Borrowed from the career-ops analysis: HTTP-only expired-posting check and
ghost-job legitimacy hints in the judge. Not required for LinkedIn import;
tracked separately.

## 8. Out of scope / future
- Indeed/Naukri/X import (same pattern could extend later; not now).
- Bookmarklet/userscript (community could emit the §5.1 shape → works via paste;
  jobctl won't own one).
- Scheduled imports.
