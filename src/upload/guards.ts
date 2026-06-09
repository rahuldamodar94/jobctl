/**
 * Upload guards for resume files. Local single-user, but cheap protection
 * against oversized / malformed / runaway inputs is still worth it.
 */

/** Resumes are tiny; anything larger is suspect (and bounds the request body). */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

/** Cap on a DOCX's total UNCOMPRESSED size + entry count — a small ZIP can inflate
 *  to GBs ("zip bomb") and mammoth's jszip inflates eagerly with no ratio guard. */
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_ZIP_ENTRIES = 2000;

/**
 * Bound a DOCX (a ZIP) before it's inflated: scan the central DIRECTORY only
 * (cheap, no inflation) to sum uncompressed sizes + count entries, and reject a
 * possible zip bomb. Conservative — if the directory can't be parsed, reject (a
 * real docx parses fine). Returns null if ok, else a user-facing reason.
 */
export function checkZipBudget(buf: Buffer): string | null {
  const EOCD = 0x06054b50; // end-of-central-directory signature
  const CDH = 0x02014b50; // central-directory file-header signature
  // EOCD sits in the last 22 bytes + up to a 64KB comment — scan backwards.
  let eocd = -1;
  const min = Math.max(0, buf.length - (22 + 65_535));
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return 'Not a valid .docx (no ZIP directory found).';
  const entries = buf.readUInt16LE(eocd + 10);
  if (entries > MAX_ZIP_ENTRIES) return 'This document has too many internal entries — refusing to parse.';
  let off = buf.readUInt32LE(eocd + 16); // offset of the central directory
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CDH) {
      return 'Could not read the document structure — refusing to parse.';
    }
    const uncompressed = buf.readUInt32LE(off + 24);
    // 0xFFFFFFFF means the real size is in a ZIP64 field (>4GB) — treat as over-cap.
    total += uncompressed === 0xffffffff ? MAX_UNCOMPRESSED_BYTES + 1 : uncompressed;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      return 'This document is too large uncompressed — refusing to parse (possible zip bomb).';
    }
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Bound a possibly-runaway parse — a malformed PDF/DOCX can hang the parser. */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
