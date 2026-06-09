/**
 * Resume upload → Markdown. DOCX and PDF only — a bare .txt/.md carries no
 * structure to learn from, so upload is intentionally limited to formatted docs
 * (the editable textarea remains for direct paste/edit).
 *
 * Deterministic, no LLM: DOCX → HTML (mammoth) → Markdown (turndown); PDF → text
 * (pdf.js, worker-disabled, text-only, no canvas). PDF extraction is inherently
 * lossy (multi-column layouts can interleave), so PDF results carry an
 * `approximate` flag and the UI tells the user to review before saving.
 *
 * Never throws: every failure degrades to an empty result with a user-facing
 * `error`, so the upload path can always fall back to paste/edit.
 */
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { MAX_RESUME_BYTES, checkZipBudget, withTimeout } from './guards.js';

export type ResumeKind = 'docx' | 'pdf';

export interface ExtractResult {
  /** converted markdown ('' on failure/empty) */
  markdown: string;
  /** PDF layout extraction is lossy — surface a "please review" banner */
  approximate: boolean;
  /** the file had no extractable text (scanned/image-only PDF) */
  empty: boolean;
  /** user-facing reason when markdown is empty */
  error?: string;
}

/** Magic-byte sniff cross-checked with the extension. DOCX is a ZIP (PK\x03\x04);
 *  PDF starts with %PDF. Anything else → null (unsupported). */
export function detectKind(filename: string, bytes: Uint8Array): ResumeKind | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // PK\x03\x04
  if (ext === 'pdf' && isPdf) return 'pdf';
  if (ext === 'docx' && isZip) return 'docx';
  return null;
}

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });

/** DOCX → HTML (mammoth) → Markdown (turndown). mammoth's own markdown output is
 *  deprecated; HTML→turndown is the maintainer-recommended, higher-quality path. */
async function extractDocx(buf: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  return turndown.turndown(html).trim();
}

interface TextItem {
  str: string;
  transform: number[];
}

/** Reassemble pdf.js positioned glyph runs into reading order: top-to-bottom
 *  (y descending), left-to-right (x ascending), inserting a newline when the
 *  baseline drops. Heuristic — multi-column pages can interleave (hence the
 *  `approximate` flag on PDF results). Exported for unit testing. */
export function itemsToText(items: TextItem[]): string {
  const runs = items.filter((i) => i.str && i.str.trim().length > 0);
  runs.sort((a, b) => {
    const dy = b.transform[5]! - a.transform[5]!;
    if (Math.abs(dy) > 2) return dy; // higher y = nearer the top of the page
    return a.transform[4]! - b.transform[4]!; // same line → left to right
  });
  let out = '';
  let lastY: number | null = null;
  for (const it of runs) {
    const y = it.transform[5]!;
    if (lastY !== null && Math.abs(lastY - y) > 2) out += '\n';
    else if (out && !/\s$/.test(out)) out += ' ';
    out += it.str;
    lastY = y;
  }
  return out.trim();
}

async function extractPdf(buf: Buffer): Promise<string> {
  // legacy ESM build, worker disabled (no workerSrc) → runs on the main thread
  // in Node; text mode only (getTextContent) so no canvas/native dependency.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(itemsToText(content.items as unknown as TextItem[]));
    page.cleanup();
  }
  await doc.cleanup();
  return pages.join('\n\n').trim();
}

/** Extract a resume file (docx|pdf) to Markdown. Never throws. */
export async function extractResume(buf: Buffer, filename: string): Promise<ExtractResult> {
  const fail = (error: string): ExtractResult => ({ markdown: '', approximate: false, empty: false, error });
  if (buf.length === 0) return fail('Empty file.');
  if (buf.length > MAX_RESUME_BYTES) return fail(`File too large (max ${MAX_RESUME_BYTES / 1024 / 1024} MB).`);

  const kind = detectKind(filename, buf);
  if (!kind) return fail('Unsupported file — upload a .docx or .pdf, or paste your resume as text below.');

  try {
    if (kind === 'docx') {
      const bombErr = checkZipBudget(buf); // bound uncompressed size BEFORE mammoth inflates
      if (bombErr) return fail(bombErr);
      const markdown = await withTimeout(extractDocx(buf), 15_000, 'docx extraction');
      if (!markdown.trim()) return fail('Could not read any text from this document. Paste your resume as text below.');
      return { markdown, approximate: false, empty: false };
    }
    const text = await withTimeout(extractPdf(buf), 20_000, 'pdf extraction');
    if (!text.trim()) {
      return {
        markdown: '',
        approximate: false,
        empty: true,
        error: 'This PDF has no extractable text (it looks scanned/image-only). Paste your resume as text below.',
      };
    }
    return { markdown: text, approximate: true, empty: false };
  } catch (e) {
    return fail(`Could not parse the file (${(e as Error).message}). Paste your resume as text below.`);
  }
}
