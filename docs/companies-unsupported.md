# Companies we can't pull (yet)

Some companies just aren't reachable. Their jobs live behind an ATS we don't
support, a gated/disabled API, or a fully custom careers portal — so they're not
in the registry (`config/companies.yaml`). This page is the short version of
"considered, not missed." 🔎

We support: **Greenhouse · Lever · Ashby · Recruitee · Workable · Teamtailor ·
Personio · Breezy · Pinpoint · SmartRecruiters** (10). Boards move, so **re-probe
before assuming** — if a company exposes one of those, add it (see
[CONTRIBUTING.md](../CONTRIBUTING.md)).

> [!NOTE]
> **Why isn't $BIG_COMPANY here?** Most giants run on Workday / iCIMS / Eightfold /
> Darwinbox / custom portals — none with a public, programmatic API. Think Google,
> Microsoft, Amazon, Apple, Meta, most frontier-AI labs, and big India product cos
> (Swiggy, Flipkart, Zerodha…). Not missing — just unreachable today.

## 🎯 Best next-adapter targets (on an ATS we don't support)

| Company | ATS | Note |
|---|---|---|
| Circle | Workday | careers.circle.com |
| StarkWare | Comeet | |
| Ondo Finance | Gem | jobs.gem.com/ondo-finance |
| CoinSwitch | RecruiterFlow | |
| Ramp Network | Greenhouse **EU** | the EU `boards-api` requires auth |

## ⚠️ Board exists but API disabled / empty (re-check occasionally)

Privy, Caldera, Chainlink Labs (Ashby posting-api disabled) · dYdX (Greenhouse
board 404s) · Clerk (live board, 0 roles) · The Graph / Edge & Node (dead/empty).

## 🧱 Custom / JS-rendered portals (no public API)

A large set — a representative sample so the gap is clear:

- **Web3:** Aave, Flashbots, Anchorage, TRM Labs, Scroll, Berachain, Immutable,
  Curve, Pendle, Maple Finance, and many more.
- **Payments/fintech:** Transak, Rapyd, Yellow Card, Increase, Felix Pago.
- **MENA/India:** Checkout.com, Noon, G42, Cashfree, Juspay, Slice, CoinDCX,
  plus most India product cos on Keka / Darwinbox.
- **Frontier AI:** Hugging Face, Groq, Character AI, AI21, Replicate — mostly
  custom portals.

> The exact ATS endpoint patterns (incl. the Workday shape for a future adapter)
> live in [CLAUDE.md](../CLAUDE.md).
