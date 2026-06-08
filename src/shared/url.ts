/**
 * Guard for scraped job URLs that get rendered as <a href>. Job links come from
 * third-party board/ATS APIs; a hostile or compromised source could return a
 * `javascript:`/`data:` URL that would execute in the app origin when clicked.
 * Only http(s) is allowed through — used at ingest (frozen into the row) and at
 * render (defense in depth).
 */
export function isHttpUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}
