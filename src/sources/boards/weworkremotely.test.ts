import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWwrFeed } from './weworkremotely.js';

const NOW = new Date('2026-06-08T12:00:00Z');
const xml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'weworkremotely.rss'),
  'utf8'
);

describe('parseWwrFeed', () => {
  const jobs = parseWwrFeed(xml, NOW);

  test('splits "Company: Role" titles; skips items with no company colon', () => {
    expect(jobs).toHaveLength(2); // the colon-less item is dropped
    const nomad = jobs[0]!;
    expect(nomad.company).toBe('Nomad');
    expect(nomad.title).toBe('Senior Software Engineer II');
    expect(nomad.sourceId).toBe('weworkremotely');
  });

  test('"Anywhere in the World" → Remote; geo-restricted region kept; always remote work mode', () => {
    expect(jobs[0]!.location).toBe('Remote');
    expect(jobs[0]!.workMode).toBe('remote');
    const designer = jobs[1]!;
    expect(designer.company).toBe('Acme Corp');
    expect(designer.location).toBe('USA Only');
    expect(designer.workMode).toBe('remote');
  });

  test('missing or unparseable pubDate → postedDate null (no crash)', () => {
    const feed = `<?xml version="1.0"?><rss><channel>
      <item><title>NoDate Co: Engineer</title><region>Anywhere in the World</region>
        <description>x</description><link>https://weworkremotely.com/remote-jobs/nodate</link></item>
      <item><title>Garbage Co: Engineer</title><region>Anywhere in the World</region>
        <description>x</description><pubDate>not a date</pubDate>
        <link>https://weworkremotely.com/remote-jobs/garbage</link></item>
    </channel></rss>`;
    const parsed = parseWwrFeed(feed, NOW);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.postedDate).toBeNull();
    expect(parsed[1]!.postedDate).toBeNull();
  });

  test('full JD inline, HTML-stripped; RFC-822 pubDate → ISO date', () => {
    const nomad = jobs[0]!;
    expect(nomad.description).toContain('About Nomad');
    expect(nomad.description).toContain('TypeScript and Go');
    expect(nomad.description).not.toContain('<p>');
    expect(nomad.postedDate).toBe('2026-05-19');
    expect(nomad.url).toBe('https://weworkremotely.com/remote-jobs/nomad-senior-software-engineer-ii');
    expect(nomad.externalId).toBe('https://weworkremotely.com/remote-jobs/nomad-senior-software-engineer-ii');
    expect(nomad.tags).toEqual(['Full-Stack Programming']);
  });
});
