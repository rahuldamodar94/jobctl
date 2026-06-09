/** Auto-detect ATS provider + slug from a pasted careers URL. */

export type AtsProvider =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'recruitee'
  | 'workable'
  | 'teamtailor'
  | 'personio'
  | 'breezy'
  | 'pinpoint'
  | 'smartrecruiters';

export interface AtsDetection {
  provider: AtsProvider;
  slug: string;
}

const PATTERNS: { provider: AtsProvider; re: RegExp }[] = [
  // embed form first — its slug lives in the ?for= query param, and the
  // generic path pattern below would wrongly capture "embed"
  { provider: 'greenhouse', re: /greenhouse\.io\/embed\/job_board\?[^#]*\bfor=([^&#]+)/ },
  { provider: 'greenhouse', re: /(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/ },
  { provider: 'lever', re: /jobs\.lever\.co\/([^/?#]+)/ },
  { provider: 'ashby', re: /jobs\.ashbyhq\.com\/([^/?#]+)/ },
  // Recruitee: the slug is the SUBDOMAIN (https://{slug}.recruitee.com/…)
  { provider: 'recruitee', re: /(?:https?:\/\/)?([a-z0-9][a-z0-9-]*)\.recruitee\.com/i },
  // Workable: the API host is fixed; the slug is the first path segment of
  // apply.workable.com/{slug} (also the human {slug}.workable.com subdomain).
  // The apply.workable.com path form must be tried BEFORE the subdomain form
  // (apply.workable.com matches `{slug}.workable.com` with slug="apply").
  { provider: 'workable', re: /apply\.workable\.com\/(?:[a-z]{2}\/)?([^/?#]+)/i },
  { provider: 'workable', re: /(?:https?:\/\/)?([a-z0-9][a-z0-9-]*)\.workable\.com/i },
  // Teamtailor: the WHOLE subdomain is the host (incl. a region label like
  // crossmint.na.teamtailor.com) — capture it all, not just the leading token.
  { provider: 'teamtailor', re: /(?:https?:\/\/)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*)\.teamtailor\.com/i },
  // Personio: slug is the leading subdomain of {slug}.jobs.personio.com.
  { provider: 'personio', re: /(?:https?:\/\/)?([a-z0-9][a-z0-9-]*)\.jobs\.personio\.com/i },
  // Breezy: slug is the subdomain of {slug}.breezy.hr.
  { provider: 'breezy', re: /(?:https?:\/\/)?([a-z0-9][a-z0-9-]*)\.breezy\.hr/i },
  // Pinpoint: slug is the subdomain of {slug}.pinpointhq.com.
  { provider: 'pinpoint', re: /(?:https?:\/\/)?([a-z0-9][a-z0-9-]*)\.pinpointhq\.com/i },
  // SmartRecruiters: slug is the first path segment of the human board
  // (jobs|careers).smartrecruiters.com/{Slug}. CASE-SENSITIVE (like Ashby) — do
  // NOT lowercase. Anchored to the human hosts so it never captures the
  // api.smartrecruiters.com endpoint as a "slug".
  { provider: 'smartrecruiters', re: /(?:jobs|careers)\.smartrecruiters\.com\/([^/?#]+)/ },
];

export function detectAts(careersUrl: string): AtsDetection | null {
  for (const { provider, re } of PATTERNS) {
    const m = careersUrl.match(re);
    if (m?.[1]) return { provider, slug: decodeURIComponent(m[1]) };
  }
  return null;
}
