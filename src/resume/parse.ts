/**
 * Parse the resume-markdown structure (the exact shape of the base resume,
 * which the generation contract requires) into typed blocks for the PDF
 * renderer. Pure function, fixture-tested against the real base resume.
 */

export interface TextRun {
  text: string;
  bold: boolean;
}

export type ResumeBlock =
  | { kind: 'company'; text: string }
  | { kind: 'role'; text: string; meta: string }
  | { kind: 'bullet'; runs: TextRun[] }
  | { kind: 'skillLine'; label: string; text: string }
  | { kind: 'paragraph'; runs: TextRun[] };

export interface ParsedResume {
  name: string;
  subtitle: string;
  contactLines: string[];
  sections: { title: string; blocks: ResumeBlock[] }[];
}

/** Split `**bold** plain **bold**` into runs. */
export function parseRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) runs.push({ text: line.slice(last, m.index), bold: false });
    runs.push({ text: m[1]!, bold: true });
    last = m.index! + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: false });
  return runs.length ? runs : [{ text: line, bold: false }];
}

/** `[label](url)` → `label` — contact lines keep the readable part only. */
function stripLinks(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

// "**Role title** — Apr 2023 to Jan 2026 · Dubai" (em dash in base files;
// generated output uses "-" since em dashes are banned there)
const ROLE_RE = /^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/;
// "- **Label**: text" (skills/education style lines)
const SKILL_RE = /^- \*\*(.+?)\*\*\s*:\s*(.+)$/;

export function parseResumeMarkdown(md: string): ParsedResume {
  const lines = md.split('\n');
  const result: ParsedResume = { name: '', subtitle: '', contactLines: [], sections: [] };
  let section: { title: string; blocks: ResumeBlock[] } | null = null;
  let sawSubtitle = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# ') && !result.name) {
      result.name = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('## ')) {
      section = { title: line.slice(3).trim(), blocks: [] };
      result.sections.push(section);
      continue;
    }

    // pre-section header area: subtitle first, then contact lines
    if (!section) {
      if (!sawSubtitle) {
        result.subtitle = stripLinks(line);
        sawSubtitle = true;
      } else {
        result.contactLines.push(stripLinks(line));
      }
      continue;
    }

    if (line.startsWith('### ')) {
      section.blocks.push({ kind: 'company', text: line.slice(4).trim() });
      continue;
    }

    const skill = line.match(SKILL_RE);
    if (skill) {
      section.blocks.push({ kind: 'skillLine', label: skill[1]!, text: skill[2]! });
      continue;
    }

    if (line.startsWith('- ')) {
      section.blocks.push({ kind: 'bullet', runs: parseRuns(line.slice(2)) });
      continue;
    }

    const role = line.match(ROLE_RE);
    if (role) {
      section.blocks.push({ kind: 'role', text: role[1]!, meta: role[2]!.trim() });
      continue;
    }

    section.blocks.push({ kind: 'paragraph', runs: parseRuns(stripLinks(line)) });
  }

  return result;
}
