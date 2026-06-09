import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTimeout, checkZipBudget, MAX_UNCOMPRESSED_BYTES } from './guards.js';

describe('withTimeout', () => {
  test('passes through a value that resolves in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'x')).resolves.toBe('ok');
  });
  test('rejects with a labelled error when the work overruns', async () => {
    const slow = new Promise<void>((r) => setTimeout(r, 200));
    await expect(withTimeout(slow, 10, 'pdf extraction')).rejects.toThrow(/pdf extraction timed out/);
  });
});

// Build a minimal ZIP central-directory (one entry) declaring `uncompressed`
// bytes — enough for checkZipBudget to scan without any real data.
function craftZip(uncompressed: number): Buffer {
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0); // central-dir header signature
  cdh.writeUInt32LE(uncompressed >>> 0, 24); // uncompressed size
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(1, 8); // entries this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(46, 12); // central-dir size
  eocd.writeUInt32LE(0, 16); // central-dir offset (CDH starts at byte 0)
  return Buffer.concat([cdh, eocd]);
}

describe('checkZipBudget (docx zip-bomb guard)', () => {
  test('accepts a normal-sized entry', () => {
    expect(checkZipBudget(craftZip(50_000))).toBeNull();
  });
  test('rejects an entry that inflates past the cap', () => {
    expect(checkZipBudget(craftZip(MAX_UNCOMPRESSED_BYTES + 1))).toMatch(/zip bomb|too large/i);
  });
  test('rejects a ZIP64 sentinel (real size hidden in a >4GB field)', () => {
    expect(checkZipBudget(craftZip(0xffffffff))).toMatch(/zip bomb|too large/i);
  });
  test('rejects a non-ZIP buffer', () => {
    expect(checkZipBudget(Buffer.from('this is not a zip at all'))).toMatch(/not a valid|directory/i);
  });
  test('a real .docx passes (mammoth fixture)', () => {
    const fixture = join(process.cwd(), 'node_modules', 'mammoth', 'test', 'test-data', 'underline.docx');
    if (existsSync(fixture)) expect(checkZipBudget(readFileSync(fixture))).toBeNull();
  });
});
