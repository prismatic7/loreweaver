import { CampaignNote } from "../types";

/**
 * Tag hierarchy utilities — READ-ONLY parsing of note frontmatter tags.
 *
 * Tags live in `CampaignNote.frontmatter.tags` and may be an array of strings
 * (`["campaign/arc1/act3", "npc"]`) or a single comma/`;`-separated string
 * (`"campaign/arc1/act3, npc"`). A leading `#` is tolerated and stripped.
 * Nested paths use `/` as the separator (`#campaign/arc1/act3`).
 *
 * Nothing here writes to the vault — these are pure functions consumed by
 * {@link TagTree} and friends.
 */

export interface TagNode {
  /** Single path segment, e.g. `"arc1"` (never contains `/`). */
  name: string;
  /** Full tag path up to and including this node, e.g. `"campaign/arc1"`. */
  path: string;
  /** Ids of notes that carry exactly this full tag path. */
  noteIds: string[];
  children: TagNode[];
}

/** Normalizes one raw tag value: trims, strips a leading `#`, drops empties. */
const normalizeTag = (raw: string): string => {
  const tag = raw.trim().replace(/^#+/, "");
  return tag;
};

/**
 * Extracts a normalized tag list from a note's frontmatter.
 * Accepts an array or a single comma/`;`-separated string; missing/empty
 * frontmatter yields `[]`.
 */
export const parseNoteTags = (
  note: Pick<CampaignNote, "frontmatter">,
): string[] => {
  const raw = note.frontmatter.tags;
  if (raw === undefined || raw === null) return [];

  const candidates: string[] = Array.isArray(raw)
    ? raw.map((t) => String(t))
    : String(raw)
        .split(/[,;]/)
        .map((t) => t.trim());

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const tag = normalizeTag(candidate);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
};

/**
 * Builds a nested tag tree from the vault's notes.
 *
 * Each tag is split on `/` into segments; nodes are created in first-seen
 * order and deduped by path. `noteIds` on a node collects the notes that
 * carry that exact full path (a note tagged `campaign/arc1` is listed under
 * the `arc1` node, NOT inherited by its `act3` descendant).
 */
export const buildTagTree = (notes: CampaignNote[]): TagNode[] => {
  const roots: TagNode[] = [];
  const nodeByPath = new Map<string, TagNode>();

  const ensureNode = (name: string, path: string, parent?: TagNode): TagNode => {
    const existing = nodeByPath.get(path);
    if (existing) return existing;

    const node: TagNode = { name, path, noteIds: [], children: [] };
    nodeByPath.set(path, node);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  };

  for (const note of notes) {
    for (const tag of parseNoteTags(note)) {
      const segments = tag.split("/").filter(Boolean);
      if (segments.length === 0) continue;

      let parent: TagNode | undefined;
      let path = "";
      for (const segment of segments) {
        path = path ? `${path}/${segment}` : segment;
        parent = ensureNode(segment, path, parent);
      }
      // `parent` is now the deepest node for this tag path.
      if (parent && !parent.noteIds.includes(note.id)) {
        parent.noteIds.push(note.id);
      }
    }
  }

  return roots;
};
