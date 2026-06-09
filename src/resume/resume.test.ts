import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assembleResumePrompt, validateResumeOutput } from './prompt.js';
import { parseResumeMarkdown } from './parse.js';
import { renderResumePdf } from './render-pdf.js';

/**
 * A real base resume is the canonical fixture: the parser and renderer MUST
 * handle it perfectly — generated resumes follow the same structure by contract.
 * Tests skip gracefully if profile/ is absent (CI of a fresh clone), but locally
 * they always run.
 */
const RESUMES_DIR = join(process.cwd(), 'profile', 'resumes');
const hasFixtures = existsSync(join(RESUMES_DIR, 'resume_ic.md'));
const baseMd = hasFixtures ? readFileSync(join(RESUMES_DIR, 'resume_ic.md'), 'utf8') : '';

const job = {
  company: 'Ziina',
  title: 'Senior Backend Engineer',
  location: 'Dubai, UAE',
  category: 'fintech',
  description: 'Build payment services in TypeScript and Node.js. PostgreSQL, event-driven.',
  url: 'https://jobs.ashbyhq.com/ziina/x',
};

describe('assembleResumePrompt', () => {
  const prompt = assembleResumePrompt(job, 'SKILL RULES HERE', '# BASE RESUME');

  test('contains the skill doc, the base resume, the job, and the output contract', () => {
    expect(prompt).toContain('SKILL RULES HERE');
    expect(prompt).toContain('# BASE RESUME');
    expect(prompt).toContain('Ziina');
    expect(prompt).toContain('Senior Backend Engineer');
    expect(prompt).toContain('Build payment services');
    expect(prompt.toLowerCase()).toContain('return only');
    expect(prompt.toLowerCase()).toContain('no code fences');
  });

  test('states the em-dash ban prominently with substitutions + a self-check pass', () => {
    expect(prompt).toMatch(/em dash/i);
    expect(prompt).toContain('—'); // shows the model the exact forbidden character
    expect(prompt.toLowerCase()).toMatch(/scan|re-?read|check/); // final self-review instruction
    // the prompt's own prose must not model the habit it bans (outside the
    // deliberate forbidden-character examples on the rule lines themselves)
    const offending = prompt
      .split('\n')
      .filter((l) => l.includes('—') && !/em dash|en dash/i.test(l));
    expect(offending).toEqual([]);
  });
});

describe('validateResumeOutput', () => {
  const valid =
    '# Jane Doe\n\nSenior Backend Engineer\n\nBerlin, Germany · jane.doe@example.com\n\n## Summary\n\n' +
    'Backend engineer. '.repeat(80) +
    '\n\n## Experience\n\nstuff';

  const EMAIL = 'jane.doe@example.com';

  test('accepts a well-formed resume', () => {
    expect(validateResumeOutput(valid, EMAIL).ok).toBe(true);
  });

  test('strips accidental markdown code fences', () => {
    const fenced = '```markdown\n' + valid + '\n```';
    const r = validateResumeOutput(fenced, EMAIL);
    expect(r.ok).toBe(true);
    expect(r.markdown!.startsWith('# Jane')).toBe(true);
  });

  test('normalizes em dashes to hyphens instead of failing (skill hard rule, enforced mechanically)', () => {
    const r = validateResumeOutput(valid.replace('Backend engineer. ', 'Backend — engineer. '), EMAIL);
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain('Backend - engineer.');
    expect(r.markdown).not.toContain('—');
  });

  test('normalizes en dashes and unspaced date-range dashes too', () => {
    const r = validateResumeOutput(valid.replace('## Experience', '## Experience\n\n2019—2021 and 2021–2023'), EMAIL);
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain('2019-2021 and 2021-2023');
  });

  test('rejects output without the contact email', () => {
    const r = validateResumeOutput(valid.replace('jane.doe@example.com', 'someone@else.com'), EMAIL);
    expect(r.ok).toBe(false);
  });

  test('rejects preamble chatter before the heading', () => {
    const r = validateResumeOutput('Sure! Here is the resume:\n\n' + valid, EMAIL);
    expect(r.ok).toBe(false);
  });
});

describe.skipIf(!hasFixtures)('parseResumeMarkdown on the real base resume', () => {
  // Assertions are STRUCTURAL (derived from the fixture itself) — committed
  // tests must never hardcode the user's name, employers, or dates.
  const expectedName = baseMd.match(/^# (.+)$/m)?.[1];

  test('base resume parses fully', () => {
    const p = parseResumeMarkdown(baseMd);
    expect(p.name).toBe(expectedName);
    expect(p.subtitle.length).toBeGreaterThan(0);
    expect(p.contactLines.length).toBeGreaterThanOrEqual(2);
    expect(p.sections.map((s) => s.title)).toEqual(['Summary', 'Experience', 'Skills', 'Education']);
    const exp = p.sections[1]!;
    const companies = exp.blocks.filter((b) => b.kind === 'company').map((b) => (b as { text: string }).text);
    // every ### company heading in the markdown must come through the parser
    const mdCompanies = (baseMd.match(/^### (.+)$/gm) ?? []).map((l) => l.slice(4));
    expect(companies).toEqual(mdCompanies);
    expect(companies.length).toBeGreaterThanOrEqual(1);
    const bullets = exp.blocks.filter((b) => b.kind === 'bullet');
    expect(bullets.length).toBeGreaterThanOrEqual(8);
  });

  test('role lines carry right-aligned meta (date · location)', () => {
    const p = parseResumeMarkdown(baseMd);
    const roles = p.sections[1]!.blocks.filter((b) => b.kind === 'role') as { text: string; meta: string }[];
    expect(roles.length).toBeGreaterThanOrEqual(4);
    expect(roles[0]!.text.length).toBeGreaterThan(0);
    expect(roles[0]!.meta).toMatch(/\d{4}/); // a date range, whatever the words
  });

  test('bold spans inside bullets are extracted as runs', () => {
    const p = parseResumeMarkdown('# N\n\nsub\n\nc@e.com\n\n## Experience\n\n- Cut cost **$60K to $6K/month** fast');
    const bullet = p.sections[0]!.blocks.find((b) => b.kind === 'bullet') as {
      runs: { text: string; bold: boolean }[];
    };
    expect(bullet.runs).toEqual([
      { text: 'Cut cost ', bold: false },
      { text: '$60K to $6K/month', bold: true },
      { text: ' fast', bold: false },
    ]);
  });
});

describe('ligature canary (ATS text-layer integrity)', () => {
  test('disabling liga/clig/calt yields one glyph per character in Carlito', async () => {
    // If this fails, generated PDFs will extract "producton" instead of
    // "production" — see NO_LIGA in render-pdf.ts.
    // fontkit is pdfkit's own shaping engine (transitive dep, no types shipped)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fontkit = ((await import('fontkit')) as any).default ?? (await import('fontkit'));
    const font = fontkit.openSync(join(process.cwd(), 'assets', 'fonts', 'Carlito-Regular.ttf'));
    const word = 'production';
    const ligated = font.layout(word).glyphs.length;
    const plain = font.layout(word, { liga: false, clig: false, calt: false, rlig: false }).glyphs.length;
    expect(ligated).toBeLessThan(word.length); // proves Carlito DOES ligate 'ti'
    expect(plain).toBe(word.length); // proves our flags disable it
  });
});

describe.skipIf(!hasFixtures)('renderResumePdf', () => {
  test('base resume renders to exactly one page', async () => {
    const { buffer, pages } = await renderResumePdf(parseResumeMarkdown(baseMd));
    expect(pages).toBe(1);
    expect(buffer.length).toBeGreaterThan(3_000);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

});
