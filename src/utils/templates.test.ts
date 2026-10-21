import { describe, it, expect } from "vitest";
import { buildNoteScaffold, availableTemplateTypes } from "./templates";

describe("buildNoteScaffold", () => {
  it("pre-fills NPC frontmatter and sections", () => {
    const scaffold = buildNoteScaffold("NPC", "Vex");
    expect(scaffold.frontmatter).toMatchObject({
      type: "NPC",
      status: "alive",
      faction: "",
    });
    expect(scaffold.content).toContain("# Vex");
    expect(scaffold.content).toContain("## Appearance");
    expect(scaffold.content).toContain("## Secrets");
  });

  it("is case-insensitive", () => {
    const a = buildNoteScaffold("npc");
    const b = buildNoteScaffold("NPC");
    expect(a.frontmatter).toEqual(b.frontmatter);
  });

  it("falls back to a generic scaffold for unknown types", () => {
    const scaffold = buildNoteScaffold("Strange", "Thing");
    expect(scaffold.frontmatter).toEqual({ type: "Strange" });
    expect(scaffold.content).toContain("# Thing");
    expect(scaffold.content).toContain("## Notes");
  });

  it("offers the known template types", () => {
    expect(availableTemplateTypes()).toContain("npc");
    expect(availableTemplateTypes()).toContain("thread");
  });
});
