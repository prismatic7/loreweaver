import { CampaignNote } from "../types";

/**
 * Link extraction + resolution utilities — READ-ONLY parsing of note content.
 *
 * Recognised link syntaxes (mirrors Obsidian conventions):
 * - `[[Target]]` — wiki-link by note title (or `folder/Note Title` path)
 * - `[[Target|Alias]]` — wiki-link with display alias (target is before `|`)
 * - `[Target]` — single-bracket short link; markdown hyperlinks
 *   (`[text](url)`) are excluded — the `]` must not be followed by `(`
 *
 * Target matching is case-insensitive and whitespace-normalised, resolved
 * against note titles, filename leaves (path without folders/.md), and
 * frontmatter aliases. Nothing here writes to the vault.
 */

/** Whitespace-normalised lowercase form used for all link comparisons. */
export const normalizeLinkText = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, " ");

/** Strips a `.md` extension and any folder path from a note path. */
export const noteFileStem = (path: string): string =>
  (path.split("/").pop() ?? "").replace(/\.md$/i, "");

/** Compares two names ignoring case, whitespace, hyphens and underscores. */
const compactEqual = (a: string, b: string): boolean =>
  a.toLowerCase().replace(/[\s\-_]/g, "") ===
  b.toLowerCase().replace(/[\s\-_]/g, "");

/**
 * Extracts all link targets from markdown content.
 * Wiki links are consumed first so their brackets aren't re-matched by the
 * single-bracket pass; single-bracket `[Target]` links are matched only when
 * not followed by `(` (i.e. not markdown hyperlinks).
 * Returns lowercase, whitespace-normalised leaf targets.
 */
export const extractLinkTargets = (content: string): string[] => {
  const targets: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    // `[[Target|Alias]]` — resolve on the target, before the `|`.
    const target = raw.split("|")[0] ?? raw;
    // Leaf form: `folder/Note Title` resolves on the title segment.
    const leaf = target.split("/").pop() ?? target;
    const norm = normalizeLinkText(leaf);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      targets.push(norm);
    }
  };

  // Pass 1: consume wiki links, recording their positions.
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of content.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
    add(match[1]);
  }

  // Pass 2: single-bracket links outside wiki-link spans, not followed by `(`.
  for (const match of content.matchAll(/(?<!\[)\[([^\]\n]+)\](?!\()/g)) {
    const start = match.index ?? -1;
    if (spans.some((s) => start >= s.start && start < s.end)) continue;
    add(match[1]);
  }

  return targets;
};

/** Frontmatter aliases of a note, as strings. */
const aliasesOf = (note: CampaignNote): string[] => {
  const aliasValue = note.frontmatter?.aliases ?? note.frontmatter?.alias;
  if (Array.isArray(aliasValue)) {
    return aliasValue.filter((a): a is string => typeof a === "string");
  }
  return typeof aliasValue === "string" ? [aliasValue] : [];
};

/**
 * Resolves a link target to a note: exact title match first, then file name,
 * then frontmatter aliases, then a punctuation-tolerant fallback match.
 */
export const resolveLinkTarget = (
  target: string,
  notes: CampaignNote[],
): CampaignNote | undefined => {
  const wanted = normalizeLinkText(target);
  if (!wanted) return undefined;

  return (
    notes.find((n) => normalizeLinkText(n.title) === wanted) ??
    notes.find((n) => normalizeLinkText(noteFileStem(n.path)) === wanted) ??
    notes.find((n) => aliasesOf(n).some((a) => normalizeLinkText(a) === wanted)) ??
    notes.find(
      (n) =>
        compactEqual(n.title, target) ||
        compactEqual(noteFileStem(n.path), target),
    )
  );
};

/**
 * Returns notes that link TO the given note (its backlinks).
 * A note is a backlink when any of its extracted link targets resolves to
 * the current note's title, file stem, or an alias.
 */
export const findBacklinks = (
  current: CampaignNote,
  notes: CampaignNote[],
): CampaignNote[] => {
  const keys = new Set<string>([
    normalizeLinkText(current.title),
    normalizeLinkText(noteFileStem(current.path)),
  ]);
  for (const a of aliasesOf(current)) {
    if (a.trim()) keys.add(normalizeLinkText(a));
  }

  return notes.filter((note) => {
    if (note.id === current.id) return false;
    return extractLinkTargets(note.content).some((t) => keys.has(t));
  });
};