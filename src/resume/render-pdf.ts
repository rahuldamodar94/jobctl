import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParsedResume, ResumeBlock, TextRun } from './parse.js';

/**
 * Deterministic PDF renderer producing a clean single-page resume template.
 * The spec below was EXTRACTED from a reference resume PDF (not eyeballed):
 *   font Carlito (Calibri metrics; the original embeds Carlito subsets) ·
 *   name Bold 16 · subtitle Reg 10.5 · contact Reg 8.5 · section headers
 *   Bold 9.5 spaced caps ACCENT + hairline rule · company Bold 11 · role
 *   Italic 10 ACCENT with right-aligned 8.5 muted meta · body 9.5 ·
 *   colors exactly #000000 / #2b5797 / #555555.
 * Carlito ships vendored in assets/fonts (OFL); falls back to Helvetica if
 * the files are missing so tests/builds never hard-fail on fonts.
 * The LLM owns the words; this owns the layout — same input, same output.
 */

const ACCENT = '#2b5797';
const INK = '#000000';
const MUTED = '#555555';
const MARGIN = 46;
// Carlito's natural leading (1.22) is taller than the original document's
// (~1.08) — a negative lineGap compresses pdfkit's additive spacing to match.
const LINE_GAP = -1.1;
// Disable OpenType ligatures (Carlito ligates ti/tt/fi/ffi): pdfkit writes a
// broken ToUnicode map for ligature glyphs, corrupting copy/paste and ATS
// text extraction ("production" reads as "producton"). The object form is
// what fontkit honors — an empty features ARRAY does NOT disable them
// (verified experimentally); the cast bridges @types/pdfkit's string[] type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NO_LIGA = { liga: false, clig: false, calt: false, rlig: false } as any;

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');

interface Faces {
  regular: string;
  bold: string;
  italic: string;
}

function resolveFaces(doc: PDFKit.PDFDocument): Faces {
  const reg = join(FONT_DIR, 'Carlito-Regular.ttf');
  if (existsSync(reg)) {
    doc.registerFont('Body', reg);
    doc.registerFont('Body-Bold', join(FONT_DIR, 'Carlito-Bold.ttf'));
    doc.registerFont('Body-Italic', join(FONT_DIR, 'Carlito-Italic.ttf'));
    return { regular: 'Body', bold: 'Body-Bold', italic: 'Body-Italic' };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' };
}

export async function renderResumePdf(resume: ParsedResume): Promise<{ buffer: Buffer; pages: number }> {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });
  const F = resolveFaces(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const contentW = doc.page.width - MARGIN * 2;

  // ----- header block (centered) — name 16, subtitle 10.5, contact 8.5 -----
  doc.font(F.bold).fontSize(16).fillColor(INK).text(resume.name, { align: 'center', features: NO_LIGA });
  doc.moveDown(0.12);
  doc.font(F.regular).fontSize(10.5).fillColor(INK).text(resume.subtitle, { align: 'center', features: NO_LIGA });
  doc.moveDown(0.25);
  doc.fontSize(8.5).fillColor(MUTED);
  resume.contactLines.forEach((line, i) => {
    // the links line (last) renders in accent like the original
    const isLinksLine = i === resume.contactLines.length - 1 && /linkedin|github|\.com|\.io/i.test(line);
    doc.fillColor(isLinksLine ? ACCENT : MUTED).text(line, { align: 'center', lineGap: 1, features: NO_LIGA });
  });

  for (const section of resume.sections) {
    sectionHeader(doc, F, section.title, contentW);
    for (const block of section.blocks) renderBlock(doc, F, block, section.title, contentW);
  }

  // page count must be read BEFORE end() — flushing empties the page buffer
  const pages = doc.bufferedPageRange().count;
  doc.end();
  const buffer = await done;
  return { buffer, pages };
}

function sectionHeader(doc: PDFKit.PDFDocument, F: Faces, title: string, contentW: number): void {
  doc.moveDown(0.65);
  doc
    .font(F.bold)
    .fontSize(9.5)
    .fillColor(ACCENT)
    .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 2.8, features: NO_LIGA });
  const y = doc.y + 2.5;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + contentW, y).lineWidth(0.75).strokeColor(ACCENT).stroke();
  doc.y = y + 5;
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  F: Faces,
  block: ResumeBlock,
  sectionTitle: string,
  contentW: number
): void {
  switch (block.kind) {
    case 'company':
      doc.moveDown(0.28);
      doc.font(F.bold).fontSize(11).fillColor(INK).text(block.text, MARGIN, doc.y, { features: NO_LIGA });
      doc.moveDown(0.12);
      break;

    case 'role': {
      // Experience: italic accent title left, muted meta right-aligned on the
      // same baseline. Elsewhere (Education) render inline like the original.
      if (sectionTitle.toLowerCase() === 'experience') {
        const y = doc.y;
        doc.font(F.italic).fontSize(10).fillColor(ACCENT).text(block.text, MARGIN, y, {
          width: contentW * 0.62,
          features: NO_LIGA,
        });
        const afterTitle = doc.y;
        doc.font(F.regular).fontSize(8.5).fillColor(MUTED).text(block.meta, MARGIN, y + 1.5, {
          width: contentW,
          align: 'right',
          features: NO_LIGA,
        });
        doc.y = Math.max(afterTitle, doc.y) + 1.5;
      } else {
        doc.font(F.bold).fontSize(9.5).fillColor(INK).text(block.text, MARGIN, doc.y, { continued: true, features: NO_LIGA });
        doc.font(F.regular).fillColor(MUTED).text(`  ${block.meta}`, { features: NO_LIGA });
        doc.moveDown(0.12);
      }
      break;
    }

    case 'bullet': {
      const bulletIndent = 11;
      const y = doc.y;
      doc.font(F.regular).fontSize(9.5).fillColor(INK).text('•', MARGIN + 2, y);
      doc.y = y;
      renderRuns(doc, F, block.runs, MARGIN + 2 + bulletIndent, contentW - 2 - bulletIndent, 9.5);
      doc.moveDown(0.14);
      break;
    }

    case 'skillLine':
      doc.font(F.bold).fontSize(9.5).fillColor(INK).text(`${block.label}: `, MARGIN, doc.y, { continued: true, features: NO_LIGA });
      doc.font(F.regular).text(block.text, { lineGap: LINE_GAP, features: NO_LIGA });
      doc.moveDown(0.15);
      break;

    case 'paragraph':
      renderRuns(doc, F, block.runs, MARGIN, contentW, 9.5);
      doc.moveDown(0.2);
      break;
  }
}

/** Mixed bold/regular runs as one flowing text block (pdfkit `continued`). */
function renderRuns(
  doc: PDFKit.PDFDocument,
  F: Faces,
  runs: TextRun[],
  x: number,
  width: number,
  size: number
): void {
  doc.fontSize(size).fillColor(INK);
  runs.forEach((run, i) => {
    doc.font(run.bold ? F.bold : F.regular);
    const opts: PDFKit.Mixins.TextOptions = { width, lineGap: LINE_GAP, continued: i < runs.length - 1, features: NO_LIGA };
    if (i === 0) doc.text(run.text, x, doc.y, opts);
    else doc.text(run.text, opts);
  });
}
