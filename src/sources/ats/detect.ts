/** Auto-detect ATS provider + slug from a pasted careers URL. */

export type AtsProvider = 'greenhouse' | 'lever' | 'ashby' | 'recruitee';

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
];

export function detectAts(careersUrl: string): AtsDetection | null {
  for (const { provider, re } of PATTERNS) {
    const m = careersUrl.match(re);
    if (m?.[1]) return { provider, slug: decodeURIComponent(m[1]) };
  }
  return null;
}
