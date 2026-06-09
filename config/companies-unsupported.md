# Companies considered but not yet supported

Every company researched whose jobs we can't pull via the supported ATS APIs
(Greenhouse / Lever / Ashby / **Recruitee**) today. Endpoint patterns for the
next ATS adapters are documented in CLAUDE.md. Re-probe before assuming anything
here is still unavailable — boards move. (Recruitee is now a supported adapter,
so former Recruitee entries that have live offers were promoted to
companies.yaml — e.g. Tether.)

## On a known ATS we don't support yet (best v2 adapter targets)

| Company | ATS | URL |
|---|---|---|
| Reap | Teamtailor | https://careers.reap.global/jobs (~23 jobs at probe) |
| WalletConnect | Workable | https://apply.workable.com/walletconnect/ |
| Crossmint | Teamtailor | https://crossmint.na.teamtailor.com/ |
| Zero Hash | Breezy HR | https://zero-hash.breezy.hr/ |
| Safe | Personio | https://safe-labs.jobs.personio.com |
| M2 | Recruitee | https://m2.recruitee.com/ (0 open roles at probe) |
| Circle | Workday | https://careers.circle.com |
| StarkWare | Comeet | https://www.comeet.com/jobs/starkware/C6.00E |
| Ondo Finance | Gem | https://jobs.gem.com/ondo-finance |
| CoinSwitch | RecruiterFlow | https://recruiterflow.com/coinswitch/jobs |
| Tabby | Pinpoint | https://tabby.pinpointhq.com/ |
| Talabat | Delivery Hero | https://careers.deliveryhero.com/talabat |
| Ramp Network | Greenhouse **EU** | boards.eu.greenhouse.io/rampnetwork — the public boards-api requires auth for EU boards |

## Board exists but API disabled / empty (re-check occasionally)

- **Privy** — https://jobs.ashbyhq.com/privy (posting-api disabled)
- **Caldera** — https://jobs.ashbyhq.com/caldera (posting-api disabled)
- **Chainlink Labs** — https://jobs.ashbyhq.com/chainlink-labs (posting-api disabled)
- **Coinbase** — Greenhouse board exists, API returns 0; jobs live on coinbase.com/careers
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
MNT-Halan/Lucky, Foodics, Tabby (Pinpoint, already noted), Tamara (Greenhouse
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
