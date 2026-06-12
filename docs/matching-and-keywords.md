# Matching & keywords — how scoring works, and how to tune it

The matcher is the heart of jobctl, and it's **deterministic** — it does exactly
what your config says, every time, with no model involved. That's a feature: you
can always see *why* a job scored the way it did, and a small change to your
keywords changes your results in a predictable way. It also means the quality of
your shortlist is **entirely in your hands**. This guide explains the mechanics
and how to tune them.

Everything here lives in your `roles.yaml` and is edited most easily via
**Settings → Role** in the app.

---

## The two stages: gate, then score

Every job goes through two stages against your role:

1. **The hard filter (the gate).** A pass/fail check. If a job fails, it's not a
   match and doesn't appear in your matched list at all.
2. **The score.** Everything that passes the gate gets a 0–100 score, used to rank
   and to set your triage floor (e.g. "show me `new` jobs scoring ≥ 30").

### Stage 1 — the hard filter

A job must clear **all** of these to be a match:

- **Title keyword** — the job title must contain at least one of your
  `title_keywords`. This is a substring match on the lowercased title, so
  `backend engineer` matches "Senior Backend Engineer (Remote)". This is the
  coarse gate: get it wrong and you either miss real roles or drown in noise.
- **No excluded title term** — if the title contains any of your `title_exclude`
  terms (matched on whole words), the job is rejected outright. This is how you
  keep out `intern`, `junior`, `manager`, etc.
- **At least one must-have stack term** — the JD must mention at least one of your
  `must_have_stack` terms (matched on whole words, so `node` won't match "a node
  in the cluster"). This is your hard skill floor.
- **No excluded primary language** — if one of your `exclude_if_primary` terms is
  clearly the JD's *primary* language (it dominates the opening, or appears in
  required-skill phrasing), the job is rejected. This is how a TypeScript dev keeps
  out a `rust`-primary role that merely mentions TS once.

**Short or missing JD:** some boards only give a title and a location, no
description. Rather than drop those, the matcher matches on the title and tags and
**includes the job with a "stack unverified" flag** — better to show it with a
caveat than to hide a real role. (A *full* JD with no stack evidence, on the other
hand, is rejected.)

### Stage 2 — the score (0–100)

Jobs that pass the gate are scored by adding up four parts, then normalizing to a
0–100 scale:

| Part | What it rewards | Rough weight |
|---|---|---|
| **Must-have coverage** | how many of your must-have terms the JD hits | up to ~20 |
| **Nice-to-have weights** | your weighted boost keywords (the big tuning lever) | up to ~30 |
| **Location** | a preferred location (+) or a relocation-OK one (smaller +) | 15 / 10 |
| **Seniority** | the title matches your seniority (senior/staff/lead/…) | up to ~10 |

Negative nice-to-have weights subtract from the score (and aren't capped), so they
genuinely push a poor-fit job down. **A job that passes the gate but scores 0 still
shows up** (at score 0) — passing the gate means it's relevant enough to see; the
score just ranks it.

---

## 🎛️ The knobs, and how to tune each

### `title_keywords` — the gate, so get it right first

This single-handedly decides what's even considered. Two failure modes:

- **Too narrow** ("senior backend engineer" only) → you miss "Backend Engineer",
  "Software Engineer, Backend", "Platform Engineer", and dozens of real variants.
- **Too broad** (a bare `engineer`) → "Engineering Manager", "Sales Engineer",
  "QA Engineer" all slip through, and your list fills with noise.

Aim for the real-world *variants of your role*: the role-name spellings, the
seniority-prefixed forms, and the adjacent titles that are genuinely the same job.
The role templates ship with a strong set — start from one.

### `must_have_stack` — your skill floor

List the core skills where **at least one** must appear. Keep it to genuine
must-haves; this is an OR, not an AND, so a long list is permissive. Use the exact
tokens that appear in JDs (`typescript`, `node.js`, `react`).

### `nice_to_have` — where a generic match becomes *yours*

This is the highest-value tuning surface. Each entry is a keyword and a weight:

```yaml
nice_to_have:
  microservices: 5
  distributed systems: 5
  kafka: 4
  react: -10          # I'm backend; demote front-end-heavy roles
  "on-site only": -10 # I want remote; push these down
```

Positive weights pull the jobs you want to the top; negative weights sink the ones
you don't. This is how two backend roles with identical titles end up ranked by how
well they actually match *your* interests.

### `title_exclude` and `exclude_if_primary` — keep the noise out

- `title_exclude` rejects on the **title** (`intern`, `manager`, `director`, a
  specialization you don't want). Whole-word matched, so it's precise.
- `exclude_if_primary` rejects when a **language you don't work in** is the JD's
  main language — without rejecting a JD that merely name-drops it once.

> [!TIP]
> **A real example:** a generic backend role with a bare `engineer` title keyword
> and no `manager` exclusion will happily match "Engineering Manager" jobs (the
> word "Engineering" contains "engineer"). Add `manager` / `director` / `head of`
> to `title_exclude`, and drop the bare catch-all, and they're gone. Small config
> change, big difference in list quality.

---

## Let the AI do a first pass for you

You don't have to hand-tune everything. In **Settings → Role**, the
**Tune with AI** action reads your uploaded resume and proposes an updated role —
it **keeps your title keywords** and focuses on the weights, the stack, and the
exclusions (the parts that are tedious to get right by hand). It shows you a
**diff of exactly what it would add, remove, or re-weight**, and you choose whether
to apply it before saving. It's a starting point you then refine, not an
auto-pilot. (This uses your configured AI backend — see
[ai-features.md](ai-features.md).)

---

## Why scores change between runs (and why that's good)

Every scrape **re-scores every active job** against your current config. So when
you tweak a weight or add an exclusion, the change applies to your *whole* list on
the next run, not just to newly-found jobs. There's no stale state to clear — your
config is always the source of truth.

## A quick word on de-duplication

The same job often appears on several boards, or gets reposted with a slightly
different title. jobctl collapses these into one row so you never triage the same
job twice:

- **Exact duplicates** (same company, normalized title, and location bucket) merge
  automatically.
- **Near-duplicates** merge on a fuzzy title comparison within the same company —
  enough shared core words and they're treated as the same role. Genuinely
  different roles at the same company (e.g. a Backend role vs an SRE role) are kept
  apart.
- A job you've already triaged that gets reposted is **suppressed**, so it never
  resurfaces as `new`.

This is why marking something `applied` or `dismissed` once is enough — the
de-dupe layer makes it stick across boards and reposts.

---

For the full architectural detail — exact thresholds, normalization, and the
de-dupe invariants — see [CLAUDE.md](../CLAUDE.md).
