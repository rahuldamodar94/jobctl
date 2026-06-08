# Security Policy

## Threat model: localhost, single-user by design

jobctl is a self-hosted, single-user tool. It binds to `localhost` and has **no
authentication, CORS, or rate limiting** — this is a deliberate design choice
documented in the README ("Design decisions"), not an oversight.

**Do not expose jobctl to the internet or a shared/multi-user host.** Its API
includes unauthenticated endpoints that write config under `profile/` and
trigger scrapes. If you must run it on a non-local interface, put your own
authentication (e.g. a reverse proxy with auth) in front of it and treat every
endpoint as privileged.

## Data & secrets

- Personal config lives in the gitignored `profile/` directory and never leaves
  your machine.
- LLM API keys (for the optional OpenAI-compatible judge/resume backends) are
  read only from environment variables named in your config (`api_key_env`) —
  never store keys in YAML. See `.env.example`.
- The core scrape → match → triage loop needs no API keys at all.

## Reporting a vulnerability

If you find a security issue (especially anything exploitable on a default
localhost install — e.g. via scraped/malicious job data), please **open a
GitHub issue** describing the impact and reproduction. For anything you'd prefer
not to disclose publicly, mark it clearly and request a private channel in the
issue, and it will be addressed before details are shared.

There is no bug bounty — this is a community tool — but reports are very much
appreciated and will be credited.
