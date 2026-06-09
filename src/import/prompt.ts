/**
 * Generates the Claude-Chrome-extension prompt for a LinkedIn import, assembled
 * from the user's OWN config (roles.yaml keywords + profile.yaml geo_priority).
 * The prompt is the real asset: it front-loads filtering into the LinkedIn
 * search so the extension only opens already-relevant postings, and it bakes in
 * the anti-bot discipline. The server never touches LinkedIn — the user runs
 * this in their own logged-in browser. See docs/linkedin-import.md.
 */
import type { loadRoles, loadProfile } from '../config/load.js';

/** Recency window for the LinkedIn search (matches the design: ≤14 days). */
export const LINKEDIN_RECENCY_DAYS = 14;
/** Soft per-session cap — keeps a run human-paced and bounded (anti-bot). */
export const LINKEDIN_SESSION_CAP = 40;

type Roles = ReturnType<typeof loadRoles>;
type Profile = ReturnType<typeof loadProfile>;

/** Distinct, human-readable search terms = role title keywords across all roles. */
function searchTerms(roles: Roles): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of roles) {
    for (const k of r.titleKeywords) {
      const key = k.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(k);
      }
    }
  }
  return out;
}

/** Must-have stack terms (union) — used to keep the search on-target. */
function stackTerms(roles: Roles): string[] {
  const seen = new Set<string>();
  for (const r of roles) for (const k of r.mustHaveStack) seen.add(k);
  return [...seen];
}

export function buildLinkedInPrompt(roles: Roles, profile: Profile): string {
  const terms = searchTerms(roles);
  const stack = stackTerms(roles);
  const locations = profile.geoPriority;

  const termList = terms.length ? terms.join(', ') : '(no role keywords configured)';
  const stackList = stack.length ? stack.join(', ') : '(none)';
  const locList = locations.length ? locations.join(', ') : 'Remote';

  return `You are helping me collect relevant job postings from LinkedIn Jobs, using MY already-logged-in browser session. Work carefully and like a human — this is assisted browsing, not a crawler.

GOAL
Find recent, relevant jobs and extract each one's full "About the job" description, then output them as a single JSON object (schema at the end) that I will paste into my job tracker.

SEARCH (do the filtering up front so you only open relevant postings)
- Search LinkedIn Jobs for these roles/titles: ${termList}.
- Prefer postings that also mention my stack: ${stackList}.
- Locations (in priority order; include "Remote"): ${locList}.
- Date posted: PAST ${LINKEDIN_RECENCY_DAYS} DAYS only (use LinkedIn's "Date posted" filter).
- Skip anything clearly off-target (wrong seniority, wrong stack, wrong location).

FOR EACH MATCHING POSTING
- Open it, and copy the FULL "About the job" section text (not a summary).
- Capture: title, company, location (as shown), the posting URL, work mode
  (remote/hybrid/onsite if shown), salary text (if shown), and "posted X ago".

ANTI-BOT — IMPORTANT, DO NOT SKIP
- Go SLOWLY: open ONE posting at a time, with a natural, varied pause between actions. Never open many in parallel.
- Stop after about ${LINKEDIN_SESSION_CAP} postings (or ~20 minutes), whichever comes first.
- If LinkedIn shows ANY captcha, "unusual activity", security check, or login/verify wall: STOP IMMEDIATELY, do not attempt to bypass it, and tell me what happened with whatever you collected so far.
- Never log in, change account settings, or click apply — only read job postings.

OUTPUT
Return ONLY this JSON (no commentary):
{
  "source": "linkedin",
  "jobs": [
    {
      "title": "…",
      "company": "…",
      "location": "…",
      "url": "https://www.linkedin.com/jobs/view/<id>",
      "description": "<full About the job text>",
      "workMode": "remote | hybrid | onsite | unknown",
      "salaryText": "… or omit",
      "postedRelative": "e.g. 2 weeks ago"
    }
  ]
}`;
}
