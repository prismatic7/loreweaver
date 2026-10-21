/**
 * Note templates: frontmatter + body scaffolds keyed by note type.
 *
 * Creating a note "from template" pre-fills the type metadata, sensible
 * defaults (status/faction), and the section headings so the author starts
 * with structure instead of a blank page.
 */

export interface NoteScaffold {
  frontmatter: Record<string, unknown>;
  content: string;
}

interface ScaffoldSpec {
  frontmatter: Record<string, unknown>;
  sections: string[];
}

const SCAFFOLDS: Record<string, ScaffoldSpec> = {
  npc: {
    frontmatter: { type: "NPC", status: "alive", faction: "" },
    sections: ["Appearance", "Personality", "Relationships", "Secrets"],
  },
  location: {
    frontmatter: { type: "Location" },
    sections: ["Description", "Notable Features", "Inhabitants"],
  },
  faction: {
    frontmatter: { type: "Faction", status: "active" },
    sections: ["Goals", "Members", "Resources"],
  },
  item: {
    frontmatter: { type: "Item" },
    sections: ["Description", "Properties", "History"],
  },
  thread: {
    frontmatter: { type: "Thread", status: "open" },
    sections: ["Situation", "Stakes", "Next Steps"],
  },
  event: {
    frontmatter: { type: "Event", date: "" },
    sections: ["What Happened", "Who Was There", "Consequences"],
  },
};

/** Builds the frontmatter + body for a new note of `type`. */
export function buildNoteScaffold(type: string, title = "New Note"): NoteScaffold {
  const spec = SCAFFOLDS[type.toLowerCase()];
  if (!spec) {
    return {
      frontmatter: { type },
      content: `# ${title}\n\n## Notes\n`,
    };
  }
  const sections = spec.sections.map((s) => `## ${s}\n`).join("\n");
  return {
    frontmatter: { ...spec.frontmatter },
    content: `# ${title}\n\n${sections}`,
  };
}

/** The template types offered by the "New → …" menu. */
export function availableTemplateTypes(): string[] {
  return Object.keys(SCAFFOLDS);
}
