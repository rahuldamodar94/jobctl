import { describe, expect, test } from 'vitest';
import { buildAuthorPrompt, buildRubricPrompt, buildSkillPrompt } from './prompt.js';

const RESUME = '# Jane Doe\nSenior Backend Engineer\nTypeScript, Node.js, Go. 8 years.';

describe('authoring prompts', () => {
  test('rubric prompt embeds the resume, location, the required section headers, and grounding', () => {
    const p = buildRubricPrompt({ resume: RESUME, location: 'Remote, EU' });
    expect(p).toContain(RESUME);
    expect(p).toContain('Remote, EU');
    for (const h of ['# JD Evaluation Rubric', '## Candidate snapshot', '## Auto-skip', '## Score each 0-3', '## Verdict', '## Output per JD']) {
      expect(p).toContain(h);
    }
    expect(p).toMatch(/Ground EVERY statement/);
    expect(p.toLowerCase()).toContain('no code fences');
  });

  test('skill prompt embeds the resume and the required section headers', () => {
    const p = buildSkillPrompt({ resume: RESUME });
    expect(p).toContain(RESUME);
    for (const h of ['# Resume Generation Rules', '## Candidate profile', '## Canonical facts', '## Approved skills list', '## Structure & voice', '## Hard rules']) {
      expect(p).toContain(h);
    }
  });

  test('refinement passes the current draft + instruction with a "smallest change" directive', () => {
    const p = buildAuthorPrompt('rubric', { resume: RESUME, currentDraft: '# Old rubric\nstuff', instruction: 'be stricter on location' });
    expect(p).toContain('# Old rubric');
    expect(p).toContain('be stricter on location');
    expect(p).toMatch(/SMALLEST change/);
  });

  test('no refinement block when neither draft nor instruction is given', () => {
    expect(buildRubricPrompt({ resume: RESUME })).not.toContain('REVISION INSTRUCTION');
  });
});
