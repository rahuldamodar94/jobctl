# Matching & keywords

The matcher is **deterministic** — no model, just your config. You always know exactly why a job scored what it did, and tweaking a keyword has predictable results. Everything lives in `roles.yaml`, editable via **Settings → Role**.

---

## Two stages: gate, then score

**Stage 1 — hard filter (pass/fail).** A job is only a match if it clears all four checks:

- **Title keyword** — title must contain ≥1 of your `title_keywords` (substring match, case-insensitive). `backend engineer` matches "Senior Backend Engineer (Remote)".
- **No excluded title term** — title must not contain any `title_exclude` term (whole-word). Keeps out `intern`, `manager`, etc.
- **≥1 must-have stack term** — the JD must mention ≥1 `must_have_stack` term (whole-word, so `node` won't match "a node in the cluster").
- **No excluded primary language** — if an `exclude_if_primary` term clearly dominates the JD (required-skill phrasing, etc.), the job is rejected — even if your stack gets a mention.

**Short/missing JD:** if a board only gives a title and location, the job is matched on title+tags and flagged **"stack unverified"** rather than dropped. A full JD with zero stack evidence, on the other hand, is rejected.

**Stage 2 — score (0–100).** Everything that passes the gate gets scored:

| Part | What it rewards | Rough weight |
|---|---|---|
| Must-have coverage | how many must-have terms the JD mentions | up to ~20 |
| Nice-to-have weights | your weighted boost keywords | up to ~30 |
| Location | preferred location / relocation-OK | 15 / 10 |
| Seniority | title matches your level (senior/staff/lead/…) | up to ~10 |

Negative weights subtract and aren't capped — they genuinely push poor-fit jobs down. A job that passes the gate at score 0 **still shows up**; the score just ranks it.

---

## 🎛️ The knobs

### `title_keywords` — the gate, get this right first

Two failure modes:
- **Too narrow** (`senior backend engineer` only) → misses "Software Engineer, Backend", "Platform Engineer", and plenty of real variants.
- **Too broad** (bare `engineer`) → "Engineering Manager", "Sales Engineer", "QA Engineer" all slip through.

Aim for the real-world variants of your role. The built-in role templates give you a solid starting point.

### `must_have_stack` — your skill floor

One of these must appear in the JD. It's an OR, so a long list is permissive — keep it to genuine must-haves. Use the exact tokens JDs use (`typescript`, `node.js`, `react`).

### `nice_to_have` ✨ — where a generic match becomes *yours*

This is the highest-value tuning surface. Positive weights pull the roles you want to the top; negative weights sink the ones you don't.

```yaml
nice_to_have:
  microservices: 5
  distributed systems: 5
  kafka: 4
  react: -10          # I'm backend; demote front-end-heavy roles
  "on-site only": -10 # I want remote; push these down
```

Two backend roles with identical titles can end up ranked very differently based on what's actually in the JD.

### `title_exclude` and `exclude_if_primary` — kill the noise

- `title_exclude` — rejects on the **title** (whole-word). Use for `intern`, `manager`, `director`, specializations you don't want.
- `exclude_if_primary` — rejects when a language you don't work in is the JD's **main** language, without rejecting a JD that merely name-drops it.

> [!TIP]
> **A real example:** a bare `engineer` title keyword with no `manager` exclusion will happily match "Engineering Manager" (the word "Engineering" contains "engineer"). Add `manager` / `director` / `head of` to `title_exclude`, drop the bare catch-all, and they're gone.

---

## Let AI do a first pass

In **Settings → Role**, the **Tune with AI** action reads your resume and proposes changes — it preserves your title keywords and focuses on the weights, stack, and exclusions (the tedious parts). It shows you a **diff of exactly what it would add, remove, or re-weight**, and you apply or discard. Starting point, not auto-pilot. (Needs a configured AI backend — see [ai-features.md](ai-features.md).)

---

## A few more things

**Scores update every run.** Every scrape re-scores all active jobs against your current config. Tweak a weight → it applies to your whole list immediately, not just new jobs.

**De-duplication.** The same job across multiple boards, or a repost, collapses into one row:
- Exact duplicates (same company + normalized title + location) merge automatically.
- Near-duplicates (enough shared title words, same company) merge fuzzy — genuinely different roles at the same company are kept apart.
- A job you've triaged that gets reposted is **suppressed** — it never resurfaces as `new`. Mark it once, it sticks.

---

For exact thresholds, normalization details, and de-dupe invariants, see [CLAUDE.md](../CLAUDE.md).
