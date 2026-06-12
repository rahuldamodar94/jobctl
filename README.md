# jobctl

**A self-hosted job copilot for the software industry.** It scrapes company
career pages and tech job boards, scores every listing against *your* profile,
and gives you one fast page to review them — so you check **one place instead of
ten**, and **never see the same job twice**.

**Your machine, your model, your data.** It's free, private, and runs locally.
The core — scrape, de-dupe, score, triage — needs **no AI at all** and works
fully offline. When you want a hand with the reading-heavy part, bring your own
model (Claude, any OpenAI-compatible API, or a local one via Ollama) to judge how
well a job fits and to tailor your resume. That part is optional, and it's yours.

```
  company career pages  (Greenhouse · Lever · Ashby · Workable …)  ─┐
                                                                     ├─▶  dedupe ─▶ score ─▶ SQLite ─▶ triage page
  tech job boards       (remoteok · weworkremotely · himalayas · …) ─┘            (+ your AI)   (localhost:3000)
```

*De-dupe keeps each job once · scoring is keyword-based against your profile · an
optional AI pass judges fit and tailors resumes · everything lands in one local
SQLite file you triage in the browser.*

### By the numbers

- **569 company career boards** in the committed registry, each verified against
  its live API and tagged by domain.
- **12 domains** covered — AI/ML, fintech & payments, crypto/web3, cloud & infra,
  dev tools, security, data, SaaS, gaming, consumer, e-commerce, health tech.
- **10 ATS integrations** (Greenhouse, Lever, Ashby, Recruitee, Workable,
  Teamtailor, Personio, Breezy, Pinpoint, SmartRecruiters) **+ 5 job-board
  adapters**.
- **70 ready-made role templates** across engineering, design, product, data,
  marketing, and more — pick one and the wizard fills in sensible keywords.
- In a single real run, jobctl pulled **17,000+ live postings from 1,100+
  companies** into one local database — then scored and de-duped them down to a
  focused shortlist.

## What it is, and who it's for

jobctl is for one person running their own job search who's tired of refreshing a
dozen boards, re-reading the same reposted listing, and losing track of what
they've already seen. You tell it the roles, skills, and places you care about; it
pulls listings from hundreds of company career pages and job boards on demand,
scores each one against your profile, collapses duplicates, and shows you a single
data-dense page to triage. Mark a job `applied` or `dismissed` once and it never
comes back — even if it's reposted elsewhere with a slightly different title.

The matching engine is **plain keyword rules you can read and edit**, not a black
box — so you always know *why* a job scored the way it did, and you can tune it.
Everything lives on your laptop: your resume and search profile are gitignored and
never leave the machine.

## Why you'll like it

- **One inbox.** Stop checking ten job boards every morning — they all land in one
  place.
- **No repeats.** Once you triage a job, it's gone for good, even when reposted on
  another board under a different title.
- **Your rules, instantly applied.** Title keywords, must-have skills, weighted
  boosts, hard exclusions, location tiers — all in plain config. Every scrape
  re-scores everything, so a tweak takes effect on the very next run.
- **Local-first & private.** Everything is one SQLite file; your personal config
  is gitignored and never leaves your laptop.
- **AI when you want it, not when you don't.** The core runs with no model. Turn
  on the AI features for a sharper read and tailored resumes whenever you like.
- **A big head start.** A curated, live-verified registry of 569 company boards
  across 12 software-industry domains — pick what you care about and go.

## Quickstart

**You'll need:** Node 20+, npm, and git.

```bash
git clone https://github.com/rahuldamodar94/jobctl.git && cd jobctl
npm install
npm run build && npm start     # → http://localhost:3000
```

On first launch a **setup wizard** walks you through name → sources → your role →
(optional) resume, and writes your config for you — no file editing required. You
can change everything later under **Settings** in the app.

Then click **Run scrape** and start triaging. Just want to see the UI first? Hit
**Load sample jobs** on the empty state for a populated triage page you can clear
in one click.

> **Already job-hunting?** Jobs you've already applied to will show up as `new` on
> the first scrape. Mark them `applied` or `dismissed` once, and they're hidden
> for good — even when reposted elsewhere.

**Prefer editing files?** Copy the templates instead of using the wizard:
`cp -r profile.example profile`, then edit `profile.yaml` and `roles.yaml`.

**Developing?** `npm run dev` runs the UI with hot reload (port 5173, proxying the
API on 3000).

> **Reproducible setup, no Docker:** `.nvmrc` pins the Node version and
> `package-lock.json` pins exact dependency versions, so `nvm use && npm ci` gives
> everyone the same environment. (Docker was intentionally dropped — the resume-gen
> and fit-judge features need the host's `claude` CLI and can't run in a container;
> it may return for a NAS/headless-only setup later.)

## How a day looks

```
  run scrape ─▶ new matches ─▶ you triage ─▶ interested · applied · rejected · dismissed ─▶ hidden next run
```

1. Open the UI and click **Run scrape** (or schedule `npm run scrape` with cron).
2. The status bar shows the result, e.g. `38 new · 5/5 sources OK`. Broken sources
   are named, never hidden.
3. Work the default view (`new`, score ≥ 30, posted ≤ 14 days): expand a row, open
   the JD, set a status.
4. You're done. Tomorrow, only genuinely new jobs show up.

## Getting your keywords right (the part that matters most)

This is the single highest-leverage thing you do, so it's worth two minutes.
**The quality of your matches is only as good as your keywords.** The scorer is
deterministic and literal — it does exactly what your config says — so a thin or
sloppy role definition produces thin or noisy results, and a well-tuned one
produces a shortlist that's genuinely yours.

In short, your role (`roles.yaml`, edited via **Settings → Role**) has a few knobs:

- **Title keywords** — the gate. A job's title must contain one of these or it's
  skipped entirely. Too narrow and you miss real roles; too broad (a bare
  `engineer`) and you let in everything. Cover the real variants ("backend
  engineer", "software engineer", "platform engineer", …).
- **Must-have stack** — at least one must appear in the JD (e.g. `typescript`,
  `node.js`). This is your hard skill floor.
- **Nice-to-have weights** — keywords that *boost* (or, with negatives, *demote*)
  the score. This is where a generic match becomes a personal one.
- **Exclusions** — titles or primary languages that should be rejected outright
  (e.g. `intern`, `manager`, or a `rust`-primary role when you're a TS dev).

The wizard and the **role templates** give you a strong starting point, and you
can let the AI **fine-tune your role from your resume** (it keeps your title
keywords and tunes the weights and exclusions). A full walkthrough — how scoring
works end to end, and how to tune it — is in
**[docs/matching-and-keywords.md](docs/matching-and-keywords.md)**.

## AI: optional, but it makes triage a lot better

The keyword core gets you a clean, de-duped shortlist with **no model at all**.
The AI features sit *on top* and do the reading-intensive work you'd otherwise do
by hand — and that's exactly why they're worth turning on:

- **Fit-judge** reads each matched JD against a rubric *you* define and returns a
  **STRONG / DECENT / WEAK / SKIP** verdict, plus a per-dimension breakdown
  (skills · seniority · domain · location · red flags) **backed by short quotes
  from the JD** — so you can sort your shortlist by genuine fit instead of skimming
  every posting yourself. It's advisory: it adds a chip and a sort, and **never
  hides or blocks a job.**
- **Resume tailoring** drafts a one-page resume tuned to a specific job from your
  base resume, and renders it to a clean PDF — the model writes the words, the code
  controls the layout.

You bring the model (your local **`claude` CLI** on your existing subscription, any
**OpenAI-compatible API**, or a local **Ollama** model); jobctl owns the prompts,
parsing, and layout. Both features are off by default — turn them on in
**Settings → AI/LLM**, run the one-click connection check, and go.

Two concepts worth understanding before you lean on them — the **judge rubric**
(how the judge decides what's a good fit for *you*) and the **resume-gen skill**
(the rules that shape your tailored resume) — are explained, with tips on writing
good ones, in **[docs/ai-features.md](docs/ai-features.md)**. Both can be
**auto-authored from your uploaded resume** and then refined by prompt, so you're
never staring at a blank file.

> **One privacy rule that matters:** free LLM tiers may train on what you send.
> That's fine for semi-public job descriptions (the judge), but **resume
> generation should use a paid or local backend that doesn't train on your data** —
> your resume is *you*. Which backend for which job is laid out in
> **[docs/model-tradeoffs.md](docs/model-tradeoffs.md)**.

## Configure

The easiest way is the in-app **Settings** page (and the first-run wizard) — it
edits every file below, validates your input, and never touches a terminal. The
files remain the source of truth if you'd rather edit them directly:

| File | Owner | What it holds |
|---|---|---|
| `profile/profile.yaml` | you *(gitignored)* | which domains/boards to scrape, max job age, resumes, UI prefs |
| `profile/roles.yaml` | you *(gitignored)* | your single role search: titles, skills, weighted keywords, exclusions, location |
| `config/companies.yaml` | committed | the community company registry, tagged by domain |
| `config/sources.yaml` | committed | job-board definitions |
| `config/categories.yaml` | committed | category rules (the auto-detected Domain column) |

## Where jobs come from

| Source | How it's fetched |
|---|---|
| Greenhouse / Lever / Ashby company boards | public board APIs (full JDs), driven by the registry |
| jobstash.xyz | public JSON API (full JDs) |
| Recruitee / Workable / Teamtailor / Personio / Breezy / Pinpoint / SmartRecruiters | public board APIs, driven by the registry |
| web3.career | static HTML |
| remoteok.com, weworkremotely.com, himalayas.app | public JSON/RSS feeds (general remote boards) |

jobctl reads **public, programmatically-accessible** career APIs and job-board
feeds. Sources that require a logged-in session or a real browser aren't fetched
server-side; you could bring those in via your own session if you ever wanted to.
Scraping is polite by design: an identifiable user-agent, sources fetched one at a
time, per-host delays, and retries with backoff — a few hundred requests per run.

> **Wondering why a big-name company isn't covered?** Most global giants run on
> Workday, iCIMS, or custom portals with no public API, so they can't be
> aggregated yet. Hundreds of researched companies — and *why* each isn't
> supported — are listed in
> [docs/companies-unsupported.md](docs/companies-unsupported.md).

- **Add a company:** paste its careers URL into `companies.include` in your
  `profile.yaml` (the provider is auto-detected), or open a PR to add it to the
  shared registry so everyone benefits.
- **Add a board:** drop one adapter file in `src/sources/boards/` implementing
  `{ id, fetch(ctx) }` and add an entry to `config/sources.yaml`. See
  [CONTRIBUTING.md](CONTRIBUTING.md).

## Commands

```bash
npm run scrape                 # scrape all enabled sources
npm run scrape -- --source X   # scrape one source (handy for debugging)
npm run judge                  # run the optional fit-judge over matched jobs
npm run dev                    # UI + API with hot reload
npm run build && npm start     # production build + serve
npm test                       # run the test suite
```

## Design decisions

A few deliberate choices, so they don't read as gaps:

- **No login, runs on localhost.** It's a single-user tool. Don't expose it to the
  internet without putting your own authentication in front — see
  [SECURITY.md](SECURITY.md).
- **AI your way, not locked in.** The scrape-and-match core is plain keyword
  matching you can read, debug, and run with *no model at all* (even fully
  offline). AI sits *on top* — to judge fit and tailor resumes — and you choose the
  model: Claude, any OpenAI-compatible API, or a local Ollama model. No coding-CLI
  dependency, no single-vendor lock-in.
- **No headless browser.** Every supported source is plain HTTP. Sources that need
  a real browser are listed in [docs/companies-unsupported.md](docs/companies-unsupported.md).
- **One SQLite file.** De-dupe is a unique index, updates are transactions, and
  backup is a file copy.
- **Open ATS jobs are kept.** A job still returned by a company's own board is open
  by definition, so only aggregator listings are filtered by age.

## Architecture

For the full picture — data model, de-dupe and scoring rules, reliability
guarantees, and ATS endpoint patterns — see [CLAUDE.md](CLAUDE.md).

## The name

`jobctl` = "job control" — a `kubectl` / `systemctl`-style tool for running your
own job search, locally. Lowercase, self-hosted, yours.

## License

[MIT](LICENSE) © 2026 Rahul Prabhu
