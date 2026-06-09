/**
 * Upload guards for resume files. Local single-user, but cheap protection
 * against oversized / malformed / runaway inputs is still worth it.
 */

/** Resumes are tiny; anything larger is suspect (and bounds the request body). */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

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
