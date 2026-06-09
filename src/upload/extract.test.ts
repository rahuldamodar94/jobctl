import { describe, expect, test } from 'vitest';
import { detectKind, itemsToText, extractResume } from './extract.js';

const pdfBytes = () => Buffer.from('%PDF-1.4\n%…\n');
const zipBytes = () => Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

describe('detectKind (magic byte + extension cross-check)', () => {
  test('pdf magic + .pdf → pdf', () => expect(detectKind('cv.pdf', pdfBytes())).toBe('pdf'));
  test('zip magic + .docx → docx', () => expect(detectKind('My Resume.docx', zipBytes())).toBe('docx'));
  test('extension/content mismatch → null', () => {
    expect(detectKind('cv.pdf', zipBytes())).toBe(null);
    expect(detectKind('cv.docx', pdfBytes())).toBe(null);
  });
  test('txt/md/doc and extensionless are unsupported → null', () => {
    expect(detectKind('cv.txt', Buffer.from('hello'))).toBe(null);
    expect(detectKind('cv.md', Buffer.from('# hi'))).toBe(null);
    expect(detectKind('cv.doc', zipBytes())).toBe(null);
    expect(detectKind('cv', pdfBytes())).toBe(null);
  });
});

describe('itemsToText (pdf reading-order reassembly)', () => {
  const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });
  test('top-to-bottom, left-to-right; newline when the baseline drops', () => {
    const out = itemsToText([item('World', 50, 100), item('Hello', 10, 100), item('Next', 10, 80)]);
    expect(out).toBe('Hello World\nNext');
  });
  test('drops blank runs and single-spaces within a line', () => {
    expect(itemsToText([item('A', 10, 100), item('   ', 30, 100), item('B', 50, 100)])).toBe('A B');
  });
});

describe('extractResume guards (never throws, friendly errors)', () => {
  test('empty file', async () => {
    const r = await extractResume(Buffer.alloc(0), 'cv.pdf');
    expect(r.markdown).toBe('');
    expect(r.error).toMatch(/empty/i);
  });
  test('oversized file', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024);
    big.set([0x25, 0x50, 0x44, 0x46]); // %PDF so it passes detection but trips the size cap
    expect((await extractResume(big, 'cv.pdf')).error).toMatch(/too large/i);
  });
  test('unsupported type points the user to paste', async () => {
    const r = await extractResume(Buffer.from('plain text resume'), 'cv.txt');
    expect(r.error).toMatch(/docx or \.pdf|paste/i);
  });
});
