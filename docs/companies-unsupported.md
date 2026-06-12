# Companies considered but not supported

These are companies whose jobs **can't be pulled via the supported ATS APIs**, so
they're not in the registry (`config/companies.yaml`). Supported adapters today:
**Greenhouse · Lever · Ashby · Recruitee · Workable · Teamtailor · Personio ·
Breezy · Pinpoint · SmartRecruiters** (10). The endpoint pattern for the next
likely adapter (Workday) is documented in [CLAUDE.md](../CLAUDE.md).

Boards move, so **re-probe before assuming anything here is still unavailable** —
if a company exposes one of the supported ATS APIs, add it to `companies.yaml`
(see [CONTRIBUTING.md](../CONTRIBUTING.md)).

> **Why isn't $FAMOUS_COMPANY included?** Most global giants run on Workday,
> iCIMS, Eightfold, Darwinbox, or fully custom career portals — none of which
> expose a public, programmatically-accessible API — so they can't be aggregated
> today. They're listed below so it's clear they were considered, not missed.

## On a known ATS we don't support yet (best next-adapter targets)

| Company | ATS | Notes |
|---|---|---|
| Reap | Teamtailor | reap.teamtailor.com reachable but shows only "DEMO –" placeholder roles; re-check for real openings |
| M2 | Recruitee | https://m2.recruitee.com/ (0 open roles at probe) |
| Circle | Workday | https://careers.circle.com |
| StarkWare | Comeet | https://www.comeet.com/jobs/starkware/C6.00E |
| Ondo Finance | Gem | https://jobs.gem.com/ondo-finance |
| CoinSwitch | RecruiterFlow | https://recruiterflow.com/coinswitch/jobs |
| Ramp Network | Greenhouse **EU** | boards.eu.greenhouse.io/rampnetwork — the public boards-api requires auth for EU boards |

## Board exists but API disabled / empty (re-check occasionally)

- **Privy** — https://jobs.ashbyhq.com/privy (posting-api disabled)
- **Caldera** — https://jobs.ashbyhq.com/caldera (posting-api disabled)
- **Chainlink Labs** — https://jobs.ashbyhq.com/chainlink-labs (posting-api disabled)
- **dYdX** — former Greenhouse board now 404s; https://dydx.exchange/careers
- **Clerk** — https://jobs.ashbyhq.com/Clerk (live board, 0 open roles at probe)
- **The Graph / Edge & Node** — greenhouse `edgeandnode` dead (404); ashby `edge-node-ventures` empty

## Custom / JS-rendered career portals (no public ATS API found)

- **Web3:** Aave (Avara), Flashbots, Push Protocol, Galxe, Algorand Foundation,
  Frame, Anchorage Digital, TRM Labs, Tenderly, Chorus One, Kiln, P2P.org, Scroll,
  Avail, Berachain, MegaETH, Axelar (Interop Labs), deBridge, Stargate, Biconomy,
  Pimlico, ZeroDev, Dynamic, Magic, Web3Auth, thirdweb, Moralis, Zora, Farcaster
  (Merkle), Renzo, Swell, Etherscan, Blockscout, Envio, Subsquid/SQD, Espresso
  Systems, Risc Zero, Polymer Labs, Hyperlane, Chainstack, Immutable, Animoca
  Brands, Sky/Phoenix Labs, Spark, Dromos (Aerodrome/Velodrome), Pendle, Euler
  Labs, Instadapp, Yearn, Curve, Balancer Labs, Sushi, PancakeSwap, Jupiter, Maple
  Finance, Goldfinch (Warbler), M0, Agora, Beam, Gelato, Rain (Gulf exchange)
- **Payments:** Bridge.xyz (folded into Stripe), Transak, Banxa, Rapyd, Sling
  Money, Conduit Pay, Zepz, Yellow Card, Mansa, Lemon Cash, Belo, Stables, Noah,
  Iron, Decaf, Sphere Pay, Privacy.com, Increase, Felix Pago
- **MENA:** Checkout.com, Mamo, BitOasis, Fuze Finance, CoinMENA, Telr, Network
  International, Property Finder, Dubizzle Group, Kitopi, Noon, G42, Presight,
  Yango Tech
- **India:** Cashfree, Juspay, Setu, Slice, Jupiter Money, Fi Money, Navi, Pine
  Labs, PayU, BharatPe, Onmeta, CoinDCX, Swiggy, Zerodha — mostly on Keka,
  Darwinbox, Kula.ai, or custom portals
- **Dev-infra:** Convex, Turso, Fly.io, Hatchet, Upstash, Liveblocks, Ably,
  Daytona, Pusher (folded into Bird)

India product companies in particular overwhelmingly run on **Keka, Darwinbox, or
Kula.ai / custom** portals (e.g. Zluri on Keka, CleverTap on Darwinbox,
Rocketlane on Kula.ai), so supported-ATS coverage of Indian startups is genuinely
thin. Other probed India names with no supported API: Sprinto, Hasura, Chargebee,
BrowserStack, Freshworks, Zoho, Innovaccer, MoEngage, Netcore, WebEngage, Whatfix,
Gupshup, Exotel, Uniphore, Yellow.ai, Plivo, Kissflow, Capillary, Fyle, Fynd,
Shiprocket, smallcase, Zolve, Niyo, Signzy, Perfios, HyperVerge, LeadSquared,
Rupifi, Scalefusion, Toplyne, DeepSource, Airbase, Locofy, Lyzr, Vymo, Gainsight,
Icertis, Mindtickle, Niramai, Qure.ai, SigTuple, Tricog, Wysa, Practo.

Probed MENA / Gulf names with no supported API: Paymob, MoneyHash, Telda, ValU,
Khazna, MNT-Halan/Lucky, Nymcard, Mamo, Pemo, Qashio, Alaan, Multiply, Floward,
eyewa, Cartlow, Sarwa, Baraka, Tarabut, Huspy, Wio, Zywa, Flapkap, Swvl, Trella,
MoneyFellows, Instabug.

## ⚠️ Same-name false positives — never add these slugs

These ATS slugs look right but belong to a **different company**:

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

## Well-known companies not on a supported ATS

Probed across the supported ATS APIs and found on Workday / iCIMS / Eightfold /
Darwinbox / custom or gated portals — so not scrapeable today. Re-probe if a
Workday adapter is added.

- **Big tech & SaaS:** Google, Microsoft, Amazon, Apple, Meta, Netflix, Uber,
  Salesforce, Adobe, Atlassian, Snap, PayPal, Slack, Zoom, DoorDash, Grubhub,
  HashiCorp, Canva, Miro, Grammarly, Snyk, NVIDIA, Tesla, Oracle, IBM, SAP, VMware,
  Cisco, Dell, HP, Intel, Samsung, Shopify, Rippling, Wix, Etsy, Wayfair, Chewy,
  Klarna, Revolut, Navan, Tipalti, Monday.com, Coda, Loom, Productboard, Front,
  Gladly, Pulumi, Aiven, Timescale, Redpanda, Sourcegraph, Gitpod, Harness, Split,
  Teleport, Lacework, Aqua Security, Cyera, Island, Tabnine, Hex, Census,
  RudderStack, Snowplow, Monte Carlo, Bigeye, Gong, Outreach
- **Frontier AI / ML:** Hugging Face, Groq, Inflection, Adept, Character AI,
  Contextual AI, Hebbia, AI21 Labs, Liquid AI, Nous Research, Skild AI,
  Hippocratic AI, Moveworks, Twelve Labs, Mindee, Replicate, Tecton, OctoML,
  Weights & Biases, Comet ML, Luma AI, Tome, Jasper, Copy.ai
- **Self-driving / robotics:** Cruise, Aurora, Applied Intuition, Relativity
  Space, Varda, Hadrian, Castelion, Mach Industries
- **Crypto / web3:** Circle (Workday), Bitwise, Grayscale, Solana Foundation,
  Ava Labs / Avalanche, NEAR, Worldcoin / Tools for Humanity, Dapper Labs, Yuga
  Labs, Mythical Games, Dynamic, Pimlico, Biconomy, Reservoir, Berachain, Movement
  Labs, Tensor, Pump.fun, Rarible, Blur, Blockaid, Hexagate, Forta, Hypernative
- **Consumer / gaming / commerce / health:** Whatnot, Bumble, Niantic, Zynga,
  King, Playtika, Depop, Vinted, ThredUp, Grailed, Fanatics, Headspace, Noom,
  Hims & Hers, Spring Health, Carbon Health, Hinge Health, Cityblock, Devoted
  Health, Codecademy, Outschool, ShipBob, Stord, Shippo, Deliverr
- **India (Workday / Darwinbox / custom):** Swiggy, Zomato, Flipkart, Ola, Nykaa,
  Zerodha, Unacademy, Dream11, ShareChat, Urban Company, Zepto, PharmEasy, Practo,
  Delhivery, Lenskart, PolicyBazaar, MakeMyTrip, Oyo, CarDekho, upGrad, Vedantu

> **Deliberately excluded** even where reachable: industrial conglomerates with a
> tiny software-role fraction (e.g. Bosch on SmartRecruiters, ~4.6k mostly
> non-software postings) — they'd bloat the corpus without adding relevant jobs.
