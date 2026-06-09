import { join, normalize, sep } from 'node:path';
import { profileDir } from './load.js';

/**
 * Boundary-aware path guards for the personal `profile/` zone. Centralizes the
 * traversal check that was previously reimplemented (with cosmetic drift) in
 * routes/resumes.ts, routes/resume-gen.ts, and routes/settings.ts.
 *
 * A bare `startsWith(root)` would accept a sibling like `/app/profile-evil`; the
 * `root + sep` boundary plus the explicit root-equality reject prevent that and
 * stop the root dir itself from being served/written.
 */

/** Resolve `rel` strictly INSIDE profile/ (rejects the root itself + escapes). */
export function safeProfilePath(rel: string): string | null {
  const root = profileDir();
  const path = normalize(join(root, rel));
  if (path === root || !path.startsWith(root + sep)) return null;
  return path;
}

/** Resolve `rel` strictly inside profile/<subdir>/ (e.g. 'resumes', 'generated').
 *  Rejects the subdir root and any escape out of it (decode `rel` first if it
 *  may be URL-encoded). */
export function safeProfileSubpath(subdir: string, rel: string): string | null {
  const base = join(profileDir(), subdir);
  const path = normalize(join(base, rel));
  if (path === base || !path.startsWith(base + sep)) return null;
  return path;
}
