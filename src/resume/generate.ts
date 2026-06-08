import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { Repo } from '../db/repo.js';
import { loadProfile, profileDir } from '../config/load.js';
import { claudeAvailable, runClaudeCli } from '../llm/claude-cli.js';
import { assembleResumePrompt, extractEmail, validateResumeOutput } from './prompt.js';
import { parseResumeMarkdown } from './parse.js';
import { renderResumePdf } from './render-pdf.js';
import { localDateISO } from '../matcher/dates.js';

/**
 * Resume generation orchestration: job + skill doc + base resumes → prompt →
 * local `claude` CLI (headless, billed to the user's Claude subscription — no
 * API key) → validated markdown → deterministic PDF → profile/generated/.
 *
 * The CLI dependency makes this feature host-machine-only by design: on a
 * machine without the `claude` CLI, claudeAvailable() reports false and the UI
 * hides the button.
 */

const SKILL_FILE = 'RESUME_GENERATION_SKILL.md';

export { claudeAvailable };

/** Run the resume prompt through the shared CLI runner. cwd=tmpdir keeps it
 *  hermetic; plain `-p` preserves subscription auth (no API key). */
export function runClaude(prompt: string): Promise<string> {
  return runClaudeCli(prompt);
}

export interface GeneratedResume {
  dir: string;
  mdFile: string;
  pdfFile: string;
  markdown: string;
  pages: number;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/** Filename-safe, recruiter-readable: "Sr. Engineer (Backend/API)" →
 *  "Sr_Engineer_Backend_API". Casing preserved (this IS the download name). */
function fileSlug(s: string): string {
  return s.split(/[^a-zA-Z0-9]+/).filter(Boolean).join('_');
}

const GENERATED_DIR = () => join(profileDir(), 'generated');

/** Find a previous generation for this job (newest first). */
export function findExistingResume(jobId: number): { dir: string; meta: Record<string, unknown> } | null {
  const root = GENERATED_DIR();
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const metaPath = join(root, dir, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (meta.jobId === jobId) return { dir, meta };
    } catch {
      /* unreadable meta — skip */
    }
  }
  return null;
}

export async function generateResume(
  db: Database.Database,
  jobId: number,
  claudeRunner: (prompt: string) => Promise<string> = runClaude
): Promise<GeneratedResume> {
  const repo = new Repo(db);
  const job = repo.findById(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);

  const skillPath = join(profileDir(), SKILL_FILE);
  if (!existsSync(skillPath)) {
    throw new Error(`${SKILL_FILE} not found in profile/ — add your resume-generation rules there first`);
  }
  const skill = readFileSync(skillPath, 'utf8');

  // Base resumes: prefer the profile's `resumes[].base` designation (ic|em),
  // falling back to the legacy fixed filenames for back-compat. Forbidden terms
  // come from the same profile. A missing/broken profile.yaml degrades to the
  // legacy filenames + no term guardrails rather than blocking generation.
  let icFile = 'resume_ic.md';
  let emFile = 'resume_em.md';
  let forbiddenTerms: string[] = [];
  try {
    const profile = loadProfile();
    forbiddenTerms = profile.resumeRules.forbiddenTerms;
    const icEntry = profile.resumes.find((x) => x.base === 'ic');
    const emEntry = profile.resumes.find((x) => x.base === 'em');
    // entry.file is relative to profile/; strip a leading resumes/ for the join
    if (icEntry) icFile = icEntry.file.replace(/^resumes\//, '');
    if (emEntry) emFile = emEntry.file.replace(/^resumes\//, '');
  } catch {
    /* profile.yaml absent — use legacy filenames, no term guardrails */
  }
  const icPath = join(profileDir(), 'resumes', icFile);
  const emPath = join(profileDir(), 'resumes', emFile);
  const ic = existsSync(icPath) ? readFileSync(icPath, 'utf8') : '';
  const em = existsSync(emPath) ? readFileSync(emPath, 'utf8') : ic;
  if (!ic) throw new Error(`base IC resume not found (profile/resumes/${icFile})`);

  const prompt = assembleResumePrompt(
    {
      company: job.company,
      title: job.title,
      location: job.location,
      category: job.category,
      description: job.description,
      url: job.url,
    },
    skill,
    ic,
    em,
    forbiddenTerms
  );

  const raw = await claudeRunner(prompt);
  const validated = validateResumeOutput(raw, extractEmail(ic), forbiddenTerms);
  if (!validated.ok) throw new Error(`generated resume failed validation: ${validated.error}`);

  const parsed = parseResumeMarkdown(validated.markdown!);
  const { buffer, pages } = await renderResumePdf(parsed);

  const dirName = `${localDateISO()}-${slug(job.company)}-${jobId}`;
  const outDir = join(GENERATED_DIR(), dirName);
  mkdirSync(outDir, { recursive: true });
  // Name_Company_Title — the file is what recruiters see in their downloads.
  // 'resume' fallback covers fully non-Latin inputs; 120 chars stays well
  // under every filesystem's 255-byte name limit.
  const fileBase = (
    [parsed.name, job.company, job.title].map(fileSlug).filter(Boolean).join('_') || 'resume'
  ).slice(0, 120);
  writeFileSync(join(outDir, `${fileBase}.md`), validated.markdown!);
  writeFileSync(join(outDir, `${fileBase}.pdf`), buffer);
  writeFileSync(
    join(outDir, 'meta.json'),
    JSON.stringify(
      {
        jobId,
        company: job.company,
        title: job.title,
        jobUrl: job.url,
        generatedAt: new Date().toISOString(),
        engine: 'claude-cli',
        pages,
        // basenames recorded so the GET route serves the right files
        // (pre-rename generations fall back to resume.md/resume.pdf)
        mdFile: `${fileBase}.md`,
        pdfFile: `${fileBase}.pdf`,
        ...(pages > 1 ? { warning: 'content exceeded one page — trim bullets and regenerate' } : {}),
      },
      null,
      2
    )
  );

  return {
    dir: dirName,
    mdFile: `${dirName}/${fileBase}.md`,
    pdfFile: `${dirName}/${fileBase}.pdf`,
    markdown: validated.markdown!,
    pages,
  };
}
