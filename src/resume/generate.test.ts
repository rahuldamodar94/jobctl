import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initSchema } from '../db/schema.js';
import { Repo } from '../db/repo.js';

/**
 * generateResume with a mocked claude runner — verifies the full pipeline
 * (skill + bases → prompt → validate → parse → render → files on disk)
 * against a temp profile dir, using the REAL base resumes as the mocked
 * model output (they satisfy the structure contract by definition).
 */

const REAL_RESUMES = join(process.cwd(), 'profile', 'resumes');
const hasFixtures = existsSync(join(REAL_RESUMES, 'resume_ic.md'));

describe.skipIf(!hasFixtures)('generateResume (mocked claude)', () => {
  let dir: string;
  let db: Database.Database;
  let jobId: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'jh-resume-'));
    process.env.PROFILE_DIR = dir;
    mkdirSync(join(dir, 'resumes'), { recursive: true });
    cpSync(join(REAL_RESUMES, 'resume_ic.md'), join(dir, 'resumes', 'resume_ic.md'));
    cpSync(join(REAL_RESUMES, 'resume_em.md'), join(dir, 'resumes', 'resume_em.md'));
    writeFileSync(join(dir, 'RESUME_GENERATION_SKILL.md'), '# SKILL\nRules here.');
    // minimal profile.yaml — exercises the resume_rules.forbidden_terms path
    writeFileSync(
      join(dir, 'profile.yaml'),
      'name: Test User\nenabled_sources: [jobstash]\nresume_rules:\n  forbidden_terms: [SecretCorp]\n'
    );

    db = new Database(':memory:');
    initSchema(db);
    const repo = new Repo(db);
    jobId = repo.insert({
      externalId: 'x',
      sourceId: 'jobstash',
      company: 'Ziina',
      title: 'Senior Backend Engineer',
      location: 'Dubai, UAE',
      workMode: 'unknown',
      salaryText: null,
      description: 'TypeScript backend for payments.',
      url: 'https://example.com/z',
      tags: [],
      postedDate: null,
      dedupeKey: 'k1',
      normCompany: 'ziina',
      normTitle: 'senior backend engineer',
      geoBucket: 'dubai',
      category: 'fintech',
      isMatch: true,
      matchScore: 80,
      matchedRoleIds: ['senior_backend'],
      matchReasons: { matchedKeywords: [], descriptionMissing: false, roleOutcomes: {} },
    });
  });

  afterEach(() => {
    delete process.env.PROFILE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  async function freshGenerate() {
    const { vi } = await import('vitest');
    vi.resetModules(); // generate.ts captures profileDir via config module
    return import('./generate.js');
  }

  test('writes md + pdf + meta under profile/generated and returns paths', async () => {
    const { generateResume } = await freshGenerate();
    const baseIc = readFileSync(join(REAL_RESUMES, 'resume_ic.md'), 'utf8');
    // mocked model: return the IC base, em-dashes replaced per the output contract
    const mocked = async () => baseIc.replaceAll('—', '-');

    const result = await generateResume(db, jobId, mocked);
    expect(result.pages).toBe(1);
    expect(result.dir).toContain('ziina');

    const outDir = join(dir, 'generated', result.dir);
    // structural: the output keeps whatever name the base resume declares
    const expectedName = baseIc.match(/^# (.+)$/m)?.[1];
    expect(readFileSync(join(dir, 'generated', result.mdFile), 'utf8')).toContain(`# ${expectedName}`);
    expect(readFileSync(join(dir, 'generated', result.pdfFile)).subarray(0, 5).toString()).toBe('%PDF-');
    const meta = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
    expect(meta.jobId).toBe(jobId);
    expect(meta.engine).toBe('claude-cli');

    // filename = Name_Company_Title (recruiter-readable, underscored)
    const expectedSlugName = expectedName!.split(/[^a-zA-Z0-9]+/).filter(Boolean).join('_');
    const pdfBase = result.pdfFile.split('/').pop()!;
    expect(pdfBase).toBe(`${expectedSlugName}_Ziina_Senior_Backend_Engineer.pdf`);
    expect(meta.pdfFile).toBe(pdfBase);
    expect(meta.mdFile).toBe(pdfBase.replace(/\.pdf$/, '.md'));
  });

  test('messy job titles sanitize cleanly in the filename', async () => {
    const { generateResume } = await freshGenerate();
    const repo = new Repo(db);
    const messyId = repo.insert({
      externalId: 'messy',
      sourceId: 'jobstash',
      company: 'Acme, Inc.',
      title: 'Sr. Engineer (Backend/API) · Payments',
      location: null,
      workMode: 'unknown',
      salaryText: null,
      description: 'TypeScript.',
      url: 'https://example.com/messy',
      tags: [],
      postedDate: null,
      dedupeKey: 'messy-key',
      normCompany: 'acme',
      normTitle: 'sr engineer backend api payments',
      geoBucket: 'unknown',
      category: 'web2',
      isMatch: true,
      matchScore: 50,
      matchedRoleIds: [],
      matchReasons: { matchedKeywords: [], descriptionMissing: false, roleOutcomes: {} },
    });
    const baseIc = readFileSync(join(REAL_RESUMES, 'resume_ic.md'), 'utf8');
    const result = await generateResume(db, messyId, async () => baseIc.replaceAll('—', '-'));
    const pdfBase = result.pdfFile.split('/').pop()!;
    expect(pdfBase).toMatch(/_Acme_Inc_Sr_Engineer_Backend_API_Payments\.pdf$/);
    expect(pdfBase).not.toMatch(/[^a-zA-Z0-9_.]/);
  });

  test('model output with em dashes succeeds: dashes normalized, never rejected', async () => {
    const { generateResume } = await freshGenerate();
    const baseIc = readFileSync(join(REAL_RESUMES, 'resume_ic.md'), 'utf8'); // contains em dashes
    const result = await generateResume(db, jobId, async () => baseIc);
    expect(result.markdown).not.toMatch(/[—–]/);
    expect(result.pages).toBe(1);
  });

  test('profile forbidden term in model output is rejected', async () => {
    const { generateResume } = await freshGenerate();
    const baseIc = readFileSync(join(REAL_RESUMES, 'resume_ic.md'), 'utf8');
    await expect(
      generateResume(db, jobId, async () => baseIc.replaceAll('—', '-') + '\n- Led platform work at SecretCorp')
    ).rejects.toThrow(/SecretCorp/);
  });

  test('truly invalid model output (preamble chatter) is still rejected', async () => {
    const { generateResume } = await freshGenerate();
    const baseIc = readFileSync(join(REAL_RESUMES, 'resume_ic.md'), 'utf8');
    await expect(generateResume(db, jobId, async () => 'Sure! Here it is:\n\n' + baseIc)).rejects.toThrow(
      /failed validation/
    );
  });

  test('findExistingResume locates a prior generation by jobId', async () => {
    const { generateResume, findExistingResume } = await freshGenerate();
    const baseIc = readFileSync(join(REAL_RESUMES, 'resume_ic.md'), 'utf8');
    await generateResume(db, jobId, async () => baseIc.replaceAll('—', '-'));
    const found = findExistingResume(jobId);
    expect(found).not.toBe(null);
    expect(found!.meta.company).toBe('Ziina');
    expect(findExistingResume(999999)).toBe(null);
  });
});
