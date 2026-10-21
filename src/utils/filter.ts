/**
 * Structural note filters for saved searches (F4.3).
 *
 * The grammar is deliberately small and predictable — it is a *filter*, not a
 * query language:
 *
 *   type:npc            frontmatter contains "npc" (case-insensitive substring)
 *   !faction            frontmatter key is absent or empty
 *   !type:npc           negated match
 *   tag:act1            matches the `tags` list (array or comma-string form)
 *   title:oslo          matches the note title
 *   path:act1/          matches the vault-relative path
 *   "two words"         bare terms match title or content
 *
 * Terms are AND-ed. `AND`/`OR` are accepted as noise words so a query written
 * as `type:npc AND !faction` reads naturally — the semantics are always AND,
 * and there is no OR. A filter that silently guessed at OR would be worse than
 * one that requires a second saved search.
 */

export interface FilterNote {
  title: string;
  path: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

export interface FilterTerm {
  negated: boolean;
  /** `null` for a bare term (title/content substring). */
  field: string | null;
  /** `null` for an existence test (`!faction`). */
  value: string | null;
}

/** Splits on whitespace, keeping "quoted values" together. */
function tokenise(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of query) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseFilter(query: string): FilterTerm[] {
  const terms: FilterTerm[] = [];
  for (const raw of tokenise(query)) {
    const lower = raw.toLowerCase();
    // Noise words: the semantics are AND regardless.
    if (lower === "and" || lower === "or") continue;

    let token = raw;
    const negated = token.startsWith("!");
    if (negated) token = token.slice(1);
    if (!token) continue;

    const colon = token.indexOf(":");
    if (colon === -1) {
      const term: FilterTerm = { negated, field: null, value: token };
      // A bare `!word` reads as "no such thing anywhere", which is too broad to
      // be useful — treat `!field` (no value) only when it looks like a key.
      if (negated) {
        // `!faction` — existence test on the frontmatter key.
        terms.push({ negated: true, field: token, value: null });
      } else {
        terms.push(term);
      }
      continue;
    }

    const field = token.slice(0, colon).trim();
    const value = token.slice(colon + 1).trim();
    if (!field) continue;
    terms.push({ negated, field, value: value || null });
  }
  return terms;
}

function tagList(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags;
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === "string") return raw.split(",").map((t) => t.trim());
  return [];
}

function fieldValues(note: FilterNote, field: string): string[] | null {
  const frontmatter = note.frontmatter ?? {};
  switch (field.toLowerCase()) {
    case "tag":
    case "tags":
      return tagList(frontmatter);
    case "title":
      return [note.title];
    case "path":
      return [note.path];
    case "content":
      return [note.content ?? ""];
    default: {
      // Frontmatter keys are author-written, so match the key case-insensitively
      // (`TYPE:npc` must find `type: npc`).
      const key =
        Object.keys(frontmatter).find((k) => k.toLowerCase() === field.toLowerCase()) ??
        field;
      const raw = frontmatter[key];
      if (raw === undefined || raw === null) return null;
      if (Array.isArray(raw)) return raw.map((v) => String(v));
      return [String(raw)];
    }
  }
}

function termMatches(note: FilterNote, term: FilterTerm): boolean {
  const needle = (term.value ?? "").toLowerCase();

  if (term.field === null) {
    // Bare term: title or content.
    if (!needle) return true;
    return (
      note.title.toLowerCase().includes(needle) ||
      (note.content ?? "").toLowerCase().includes(needle)
    );
  }

  const values = fieldValues(note, term.field);
  const exists = values !== null && values.some((v) => v.trim() !== "");

  // `!field` — absence/emptiness.
  if (term.value === null) {
    return term.negated ? !exists : exists;
  }

  const hit = values !== null && values.some((v) => v.toLowerCase().includes(needle));
  return term.negated ? !hit : hit;
}

export function matchesFilter(note: FilterNote, query: string): boolean {
  const terms = parseFilter(query);
  if (terms.length === 0) return true;
  return terms.every((term) => termMatches(note, term));
}

export function filterNotes<T extends FilterNote>(notes: T[], query: string): T[] {
  if (!query.trim()) return notes;
  const terms = parseFilter(query);
  if (terms.length === 0) return notes;
  return notes.filter((note) => terms.every((term) => termMatches(note, term)));
}
