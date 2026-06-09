# Companies considered but not yet supported

Every company researched whose jobs we can't pull via the supported ATS APIs
today. Supported adapters now: **Greenhouse / Lever / Ashby / Recruitee /
Workable / Teamtailor / Personio / Breezy / Pinpoint**. Endpoint patterns for
the next ATS adapters (SmartRecruiters / Workday / Comeet) are documented in
CLAUDE.md. Re-probe before assuming anything here is still unavailable — boards
move. (When an adapter ships, former entries with live jobs are promoted to
companies.yaml — e.g. Tether on Recruitee; WalletConnect/Crossmint/Safe/Zero
Hash/Tabby on the Phase-1 multi-ATS adapters, 2026-06-09.)

## On a known ATS we don't support yet (best next-adapter targets)

(WalletConnect/Workable, Crossmint/Teamtailor, Safe + Gnosis Pay/Personio,
Zero Hash + Bitwave/Breezy, Tabby/Pinpoint were PROMOTED to companies.yaml when
the Phase-1 multi-ATS adapters shipped — 2026-06-09 — and are no longer listed
here.)

| Company | ATS | URL |
|---|---|---|
| Reap | Teamtailor | reap.teamtailor.com is reachable but shows only "DEMO –" placeholder roles at probe (careers.reap.global is Cloudflare-blocked); re-check for real openings |
| M2 | Recruitee | https://m2.recruitee.com/ (0 open roles at probe) |
| Circle | Workday | https://careers.circle.com |
| StarkWare | Comeet | https://www.comeet.com/jobs/starkware/C6.00E |
| Ondo Finance | Gem | https://jobs.gem.com/ondo-finance |
| CoinSwitch | RecruiterFlow | https://recruiterflow.com/coinswitch/jobs |
| Talabat | Delivery Hero | https://careers.deliveryhero.com/talabat |
| Ramp Network | Greenhouse **EU** | boards.eu.greenhouse.io/rampnetwork — the public boards-api requires auth for EU boards |

## Board exists but API disabled / empty (re-check occasionally)

- **Privy** — https://jobs.ashbyhq.com/privy (posting-api disabled)
- **Caldera** — https://jobs.ashbyhq.com/caldera (posting-api disabled)
- **Chainlink Labs** — https://jobs.ashbyhq.com/chainlink-labs (posting-api disabled)
- **dYdX** — former Greenhouse board now 404s; https://dydx.exchange/careers
- **Clerk** — https://jobs.ashbyhq.com/Clerk (live board, 0 open roles at probe)
- **Mural Pay** — jobs.ashbyhq.com/muralpay 404'd after initial verification — board removed
- **The Graph / Edge & Node** — greenhouse `edgeandnode` dead (404); ashby `edge-node-ventures` empty

## Custom / JS-rendered careers portals (no public ATS API found)

- **Web3:** Aave (Avara), Flashbots, Push Protocol, Galxe, Algorand Foundation,
  Frame (Notion page), Anchorage Digital, TRM Labs, Tenderly, Chorus One, Kiln,
  P2P.org, Scroll, Avail, Berachain, MegaETH, Axelar (Interop Labs), deBridge,
  Stargate, Biconomy, Pimlico, ZeroDev, Dynamic (dynamic.xyz), Magic (magic.link),
  Web3Auth, thirdweb, Moralis, Zora, Farcaster (Merkle), Renzo, Swell, Etherscan,
  Blockscout, Envio, Subsquid/SQD, Espresso Systems, Risc Zero, Polymer Labs,
  Hyperlane, Chainstack, Immutable, Animoca Brands, Sky/Phoenix Labs, Spark,
  Dromos (Aerodrome/Velodrome), Pendle, Euler Labs, Instadapp, Yearn, Curve,
  Balancer Labs, Sushi, PancakeSwap, Jupiter, Maple Finance, Goldfinch (Warbler),
  M0, Agora, Beam, Gelato, Rain (Gulf exchange)
- **Payments:** Bridge.xyz (folded into Stripe), Transak, Banxa, Rapyd,
  Sling Money, Conduit Pay, Zepz, Yellow Card, Mansa, Lemon Cash, Belo, Stables,
  Noah, Iron, Decaf, Sphere Pay, Privacy.com, Increase, Felix Pago
- **MENA:** Checkout.com, Mamo, BitOasis, Fuze Finance, CoinMENA, Telr,
  Network International, Property Finder, Dubizzle Group, Kitopi, Noon, G42,
  Presight, Yango Tech
- **India:** Cashfree, Juspay, Setu, Slice, Jupiter Money, Fi Money, Navi,
  Pine Labs, PayU, BharatPe, Onmeta, CoinDCX, Swiggy, Zerodha
  (mostly Keka/Darwinbox/custom portals)
- **Dev-infra:** Convex, Turso, Fly.io, Hatchet, Upstash, Liveblocks, Ably,
  Daytona (Notion), Pusher (folded into Bird)

### India pass 2 (2026-06-09) — confirmed NOT on a supported ATS

Probed across Greenhouse/Lever/Ashby/Recruitee; all 0 / not found. India product
companies overwhelmingly run on **Keka, Darwinbox, or Kula.ai / custom** portals
(verified examples below), so supported-ATS coverage of Indian startups is
genuinely thin — the wins are the few on Lever/Ashby/Greenhouse already added.

- **Keka:** Zluri (zluri.keka.com), and the typical mid-size SaaS pattern.
- **Darwinbox:** CleverTap (clevertap.darwinbox.in).
- **Kula.ai / custom:** Rocketlane, CleverTap (careers.kula.ai/*).
- **Other custom / Keka / Darwinbox (probed, no supported API):** Sprinto,
  Hasura, Chargebee, BrowserStack, Freshworks, Zoho, Innovaccer, MoEngage,
  Netcore, WebEngage, Whatfix, Gupshup, Exotel, Uniphore, Yellow.ai, Plivo,
  Kissflow, Capillary, Fyle, Fynd, Shiprocket, smallcase, Zolve, Niyo, Setu,
  Signzy, Perfios, HyperVerge, LeadSquared, Rupifi, Scalefusion, Toplyne,
  Nanonets *(now ON Greenhouse — promoted to companies.yaml)*, DeepSource,
  Airbase, Locofy, Lyzr, Vymo, Gainsight, Icertis, Mindtickle, Niramai, Qure.ai,
  SigTuple, Tricog, Wysa, Practo.

### MENA / Gulf pass 2 (2026-06-09) — confirmed NOT on a supported ATS

Most Gulf/Egypt fintech, e-commerce and crypto run on **custom portals,
Pinpoint, SmartRecruiters, or local boards (Bayt/Wuzzuf)**. Probed 0 / not found
on Greenhouse/Lever/Ashby/Recruitee: Paymob, MoneyHash, Telda, ValU, Khazna,
MNT-Halan/Lucky, Tabby (Pinpoint, already noted), Tamara (Greenhouse
**EU** — needs auth), Nymcard, Mamo, Pemo, Qashio, Alaan, Multiply, Floward,
eyewa, Cartlow, Sarwa, Baraka, Tarabut, Huspy, Wio, Zywa, Flapkap, BitOasis,
Fuze, CoinMENA, Swvl, Trella, MoneyFellows, Instabug. (Supported-ATS MENA wins
this pass — HALA, OpenFX, Yassir, Keyper — went to companies.yaml.)

## ⚠️ Same-name FALSE POSITIVES — never add these slugs

| Slug | Is actually | NOT |
|---|---|---|
| `ashby/Socket` | socket.dev (supply-chain security) | Socket/Bungee — use `greenhouse/socket` |
| `ashby/Maple` | restaurant-AI startup | Maple Finance |
| `ashby/Beam` | construction software | web3 Beam |
| `ashby/Espresso` | Snowflake-cost AI | Espresso Systems |
| `ashby/Gelato` | print logistics | Gelato Network |
| `ashby/rain` | US payroll co | Rain Gulf exchange |
| `ashby/felix` | Felix Health (telehealth) | Felix Pago |
| `lever/ethena` | HR-training SaaS | Ethena Labs — use `lever/ethenalabs` |
| `lever/safe`, `ashby/safe` | Safe Software (GIS) | Safe (Gnosis) — they're on Personio |
| `greenhouse/sei` | education nonprofit | Sei Labs — use `ashby/sei-labs` |
| `greenhouse/binance`, `ashby/binance` | empty boards | live board is `lever/binance` |
| `greenhouse/slice` | US/N.Macedonia/Mexico co | slice (Indian fintech) — on custom ATS |
| `ashby/navi` | SF founding-team startup | Navi (Sachin Bansal's Indian fintech) — custom ATS |

## Famous names on unsupported ATSes (v3 pass, 2026-06-09)

Globally-famous tech companies the owner asked us to consider. Almost all run on
**Workday / iCIMS / Eightfold / Darwinbox / custom portals** — outside the four
public ATS APIs we support — so they can't be scraped today. Re-probe if we add a
Workday/SmartRecruiters adapter (v2+ roadmap). (Net-new famous companies that DO
expose a supported ATS were added to companies.yaml in the same pass: OpenAI,
Anthropic, Snowflake, Palantir, Coinbase, Block, Toast, Affirm, Robinhood, Plaid,
SoFi, Nubank, Monzo, N26, Spotify, Airbnb, Discord, Paytm, Unity, and more.)

**Global giants — Workday / custom / iCIMS / Eightfold:** Google, Microsoft,
Amazon, Apple, Meta, Netflix, Uber, Salesforce, Adobe, Atlassian, Snap, PayPal,
Slack, Zoom, DoorDash, ServiceNow, HashiCorp, Canva, Miro, Grammarly,
Hugging Face, NVIDIA, Tesla, Oracle, IBM, SAP, VMware, Cisco, Dell, HP, Intel,
Samsung, Shopify, Rippling, Wix, Etsy, Wayfair, Chewy, TikTok/ByteDance, Grab,
Gojek, Sea/Shopee, Klarna, Wise, Revolut, Gong, Outreach, Segment.

**India — Workday / Darwinbox / custom portals:** Swiggy, Zomato, Flipkart, Ola,
Nykaa, Zerodha, Unacademy, Dream11, ShareChat, Urban Company, Zepto, Freshworks,
Zoho, BrowserStack, Chargebee, Hasura, Pine Labs, Cashfree, slice, Navi,
PharmEasy, Practo, Delhivery, Lenskart, PolicyBazaar, MakeMyTrip, Oyo, CarDekho,
upGrad, Vedantu. (Only Paytm — Lever — was scrapeable and was added.)

## Popular-company sweep (2026-06-09) — famous names probed, NOT on a supported ATS

Broad sweep over the best-known / most-desirable tech employers in every domain.
Each below was probed across the supported ATS APIs (Greenhouse / Lever / Ashby /
Recruitee / Workable / Teamtailor / Personio / Breezy / Pinpoint) and returned
404 / empty / disabled-API, OR its public board is gated. Net-new famous names
that DID expose a non-empty supported ATS were added to companies.yaml in the
same pass (CoreWeave, Bitrefill, Stripe, Cerebras, SambaNova, Crusoe, Lambda,
Figure AI, Wayve, Glean, Fireworks, Deepgram, Docker, Sentry, Redis, 1Password,
JFrog, Chainguard, Tailscale, Coalition, Whoop, Oura, Roblox-via-existing, Match
Group, Lyra Health, Kalshi, Galaxy Digital, Anchorage, BitGo, Blockchain.com,
FanDuel, Remote, Turing, Mercor, and ~120 more — see the sweep block there).

**Frontier AI / ML — custom / Workday / disabled public API:** Hugging Face
(custom apply.workable? no — custom portal), Groq (custom careers.groq.com),
Cerebras *(note: main board gated; `earlytalentcerebras` Greenhouse exists for
grads — `cerebrassystems` Greenhouse WAS live and was added)*, Mistral
(`jobs.lever.co/mistral` already in registry), Perplexity (`ashby/perplexity`
already in registry), Inflection, Adept, Character AI, Contextual AI, Hebbia,
AI21 Labs, Liquid AI, Nous Research, Skild AI, Hippocratic AI, Moveworks,
Twelve Labs, Mindee, Replicate, Modal *(in registry)*, Tecton, OctoML,
Weights & Biases, Comet ML, Luma AI, Tome, Jasper, Copy.ai — custom / Workday /
Ashby-disabled portals.

**Self-driving / robotics:** Waymo *(Greenhouse `waymo` — added)*, Zoox
*(Lever — added)*, Nuro *(Greenhouse — added)*, Cruise, Aurora, Applied
Intuition, Anduril *(Greenhouse `andurilindustries` — added)*, Shield AI *(Lever
— added)*, Saronic *(Ashby — added)*, SpaceX *(Greenhouse — added)*, Relativity
Space, Varda, Hadrian, Castelion, Mach Industries — the un-added ones are on
Workday / custom.

**Big tech & well-known SaaS — Workday / custom / iCIMS / Eightfold:** Google,
Microsoft, Amazon, Apple, Meta, Netflix, Uber, Salesforce, Adobe, Atlassian,
Canva, Miro, Grammarly, Snyk, HashiCorp, GitLab *(in registry)*, Snap, PayPal,
Shopify, Etsy, Wayfair, Chewy, DoorDash, Grubhub, Rippling, Wise, Revolut,
Klarna, Navan, Tipalti, Monday.com, Coda, Loom, Productboard, Front, Gladly,
Pulumi, Aiven, Timescale, Redpanda, Sourcegraph, Gitpod, Harness, Split,
LaunchDarkly *(Greenhouse — added)*, Teleport, Lacework, Aqua Security, Cyera,
Island, Clerk *(Ashby live, 0 roles)*, Tabnine, Codeium *(= Windsurf/Cognition,
in registry)*, Hex, Census, Segment *(= Twilio, in registry)*, RudderStack,
Snowplow, Monte Carlo, Bigeye — Workday / custom / gated.

**Crypto / web3 not on a supported public API:** Circle (Workday — see top
table), Kraken *(`ashby/kraken.com` already in registry)*, Chainalysis *(in
registry)*, Bitwise, Grayscale *(Greenhouse `grayscale` had 2 — borderline,
not added)*, Solana Foundation, Ava Labs / Avalanche, NEAR (custom), Worldcoin /
Tools for Humanity, Dapper Labs, Yuga Labs, Mythical Games, Thirdweb, Tenderly,
Privy *(Ashby disabled)*, Dynamic, Pimlico, Biconomy, Reservoir, Berachain,
Movement Labs, Caldera *(Ashby disabled)*, Tensor, Pump.fun, Bridge, Zora,
Rarible, Blur, Blockaid, Hexagate, Forta, Hypernative — custom / JS-rendered /
disabled posting-api.

**Consumer / gaming / commerce / health — Workday / custom:** Whatnot
(`ashby/whatnot` returns Not Found — public posting-api not exposed; custom),
Shopify, Bumble, Tinder/Hinge *(Match Group itself IS on Lever — added)*, Niantic,
Zynga, King, Playtika, Supercell *(Ashby — added)*, Depop, Vinted, ThredUp,
Grailed, Fanatics, Headspace, Calm *(Greenhouse `calm`=1, borderline, not added)*,
Noom, Hims & Hers, Spring Health, Carbon Health, Hinge Health, Cityblock,
Devoted Health, Codecademy, Outschool, Masterclass *(Greenhouse — added)*,
ShipBob, Stord, Shippo, Deliverr — Workday / custom / Eightfold.
