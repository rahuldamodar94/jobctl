# Importing jobs (LinkedIn, Indeed, …)

jobctl **deliberately does not scrape** LinkedIn, Indeed, Naukri, Glassdoor, and
similar sites server-side: they ban scraper traffic, some actively litigate it,
and getting past their anti-bot walls would mean running a headless browser —
which breaks jobctl's plain-HTTP, un-bannable design.

The value of those sites is **your own logged-in session**. So instead of
scraping them, jobctl gives you a small endpoint to **import** jobs you've
already pulled up — running them through the *same* dedupe + scoring pipeline as
everything else, so an imported LinkedIn role shows up right next to your
scraped jobs (and never resurfaces once you've triaged it).

> This is a **local, single-user** endpoint on your own machine. You are
> importing data from your own browser session — jobctl never logs into or
> fetches those sites for you.

## `POST /api/import`

Send a JSON body: a `site` slug (becomes the `import:<site>` source tag) and a
list of jobs.

```jsonc
{
  "site": "linkedin",            // lowercase slug → source_id "import:linkedin"
  "jobs": [
    {
      "company": "Stripe",                          // required
      "title": "Senior Backend Engineer",           // required
      "url": "https://www.linkedin.com/jobs/view/…", // required, http(s)
      "location": "Remote — US",                    // optional
      "description": "Full job description text…",   // optional (HTML is stripped)
      "salaryText": "$180k–$220k",                  // optional
      "postedDate": "3 days ago",                   // optional (ISO/epoch/relative)
      "workMode": "remote",                          // remote|hybrid|onsite|unknown
      "tags": ["go", "kubernetes"]                  // optional
    }
  ]
}
```

Response:

```json
{ "imported": 1, "received": 1, "merged": 0, "source": "import:linkedin" }
```

- `imported` — genuinely new rows added.
- `merged` — jobs that matched something already in your DB (same company +
  title + location, even from a different site) and were deduped, not duplicated.

Imported jobs are **keyword-scored against your roles** just like scraped ones,
so they get a fit score and can be fit-judged. They're tagged `import:<site>`,
so you can filter by source. Up to **100 jobs per request**; the body is capped
at 1 MB.

### Errors

- `400` — invalid payload (missing company/title, non-http(s) URL, bad `site`
  slug, empty list). The response lists exactly which fields failed.
- `409` — your profile/roles aren't configured yet (finish onboarding first).

## The Claude-assisted flow

The easy way to produce that JSON is to let an LLM read the page you already
have open and extract it for you:

1. Open the search results or a job page on LinkedIn/Indeed **in your own logged-in
   browser**.
2. Ask Claude (in the browser, or Claude Code with the page contents) to extract
   the listings as JSON in the shape above — e.g.:

   > "Extract every job on this page as a JSON array of
   > `{company, title, url, location, description, postedDate}` objects."

3. Post it to your local jobctl:

   ```bash
   curl -X POST http://localhost:3000/api/import \
     -H 'content-type: application/json' \
     -d '{ "site": "linkedin", "jobs": [ … ] }'
   ```

4. Open the UI and triage the new rows like any other.

A one-click **paste-and-import modal** in the UI is on the roadmap; until then
the endpoint above is the supported path. A browser-extension capture flow is
intentionally **not** built yet — it needs its own security design pass.

## Why not a server-side scraper or extension?

See the "Reviewed-and-REJECTED ideas" in [CLAUDE.md](../CLAUDE.md): scraping
these sites server-side trades the project's core wedges (free, keyless,
un-bannable, no headless browser) for a permanent anti-bot maintenance treadmill
and real legal risk. A user-driven import of your *own* session has none of those
problems.
