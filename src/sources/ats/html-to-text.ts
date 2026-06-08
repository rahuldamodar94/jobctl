import * as cheerio from 'cheerio';

/**
 * Convert (possibly entity-escaped) HTML job content to readable plain text.
 * Heuristic caveat: the `&lt;` sniff below treats a JD that merely DISCUSSES
 * escaped tags in prose as double-escaped and unescapes it — acceptably rare
 * for job descriptions; revisit if a board ships literal-escaped prose.
 */
export function htmlToText(html: string): string {
  // Greenhouse double-escapes content (&lt;p&gt;...) — unescape first if needed.
  const unescaped = html.includes('&lt;') ? cheerio.load(`<div>${html}</div>`)('div').text() : html;
  const $ = cheerio.load(unescaped);
  $('br').replaceWith('\n');
  $('p, li, h1, h2, h3, h4').each((_, el) => {
    $(el).append('\n');
  });
  return $.root()
    .text()
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
