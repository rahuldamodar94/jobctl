# Resume Generation Skill — template

When this file exists (and the `claude` CLI is installed on the machine running
the server), a **Generate resume** button appears on every job in the UI. Your
local Claude tailors a resume to the job description following the rules YOU
write here, and the app renders it to a one-page PDF in `profile/generated/`.

Write your rules below. The more specific, the better the output. Suggested
sections (see the repo README for the feature docs):

## Candidate profile
Name, contact details, location, education, years of experience.

## Resume selection logic
If you keep multiple base resumes in profile/resumes/, explain when to use which.

## Canonical facts
The numbers and claims that must always be stated exactly (metrics, team sizes,
project names). The generator must never invent anything beyond these.

## Approved skills list
Only skills you actually have. Anything not listed must never appear.

## Reframing rules
How to adapt wording per company type (e.g. domain-specific vs generic framing).

## Hard rules
Non-negotiables, e.g.:
1. Never fabricate experience or skills
2. One page only
3. All content honest and defensible in an interview
