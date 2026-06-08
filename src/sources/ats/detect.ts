/** Auto-detect ATS provider + slug from a pasted careers URL. */

export type AtsProvider = 'greenhouse' | 'lever' | 'ashby';

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
];

export function detectAts(careersUrl: string): AtsDetection | null {
  for (const { provider, re } of PATTERNS) {
    const m = careersUrl.match(re);
    if (m?.[1]) return { provider, slug: decodeURIComponent(m[1]) };
  }
  return null;
}
