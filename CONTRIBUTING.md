# Contributing to jobctl

Thanks for helping out! jobctl is a small, focused, single-user tool — contributions
that keep it simple and local-first are very welcome.

## Dev setup

```bash
nvm use            # Node 24 (see .nvmrc)
npm install
npm run dev        # server (tsx watch) + Vite UI with hot reload → http://localhost:5173
```

Other commands:

```bash
npm test           # vitest (run once)
npm run typecheck  # tsc --noEmit
npm run build      # production build (tsc + vite)
npm start          # run the production build → http://localhost:3000
```

Please run `npm run typecheck && npm test` before opening a PR. Match the
surrounding code style (TypeScript strict, 2-space indent — see `.editorconfig`).

## The two highest-value contributions

### 1. Add a company to the registry (no code)

`config/companies.yaml` is a community-maintained list of company ATS boards.
To add one:

1. Confirm the board is one of the 10 supported providers (Greenhouse, Lever,
   Ashby, Recruitee, Workable, Teamtailor, Personio, Breezy, Pinpoint,
   SmartRecruiters) and that its public API returns real jobs — see the endpoint
   patterns in [CLAUDE.md](CLAUDE.md) ("Current ATS endpoints").
2. Add an entry with `name`, `careers_url`, and `domains` tags (vocabulary: the
   12 ids in `config/domains.yaml` — `ai-ml fintech crypto cloud-infra devtools
   security data saas gaming consumer ecommerce healthtech`).
3. If a company *can't* be supported yet (custom portal, other ATS), note it in
   `docs/companies-unsupported.md` instead.

> [!WARNING]
> **Watch for same-name slugs** — many ATS slugs belong to a *different* company:
> `ashby/Maple` is a restaurant-AI startup (not Maple Finance), `ashby/Beam` is
> construction software (not web3 Beam), `lever/safe` is Safe Software (not Gnosis
> Safe). Confirm the board's jobs actually match the company before adding.

### 2. Add a board adapter (code)

To support a new job board:

1. Create `src/sources/boards/<id>.ts` implementing the adapter contract
   `{ id, fetch(ctx): Promise<RawJob[]> }`.
2. Add a matching entry to `config/sources.yaml`.
3. Add a fixture under `src/sources/boards/__fixtures__/` and a parser test.

For a new **ATS provider**, see `src/sources/ats/` and the `detect()` +
`fetch{Provider}` pattern; keep the host on the allowlist in `src/sources/http.ts`.

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) is the readable overview — pipeline, components,
data model, and the design choices. [CLAUDE.md](CLAUDE.md) is the exhaustive
internal reference (exact scoring weights, dedup invariants, ATS endpoint
patterns). Read at least the former before larger changes — the design choices
(no LLM in core matching, no auth, one SQLite file) are deliberate.

## Reporting bugs / requesting features

Open an issue. For "a board/company isn't scraping", include the source id and
any error from the run-status strip.
