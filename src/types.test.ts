import { describe, it, expect } from "vitest";
import {
  DEFAULT_NOTE_TYPES,
  DEFAULT_PROVENANCE_TAXONOMY,
  SOURCE_TYPES,
  PROVENANCE_KEYS,
} from "./types";

describe("world object constants", () => {
  it("DEFAULT_NOTE_TYPES has 5 entries", () => {
    expect(DEFAULT_NOTE_TYPES).toHaveLength(5);
    expect(DEFAULT_NOTE_TYPES.map((t) => t.id)).toEqual([
      "npc",
      "location",
      "faction",
      "item",
      "event",
    ]);
  });

  it("DEFAULT_PROVENANCE_TAXONOMY includes speculation", () => {
    expect(DEFAULT_PROVENANCE_TAXONOMY.map((p) => p.id)).toContain(
      "speculation",
    );
    expect(DEFAULT_PROVENANCE_TAXONOMY).toHaveLength(4);
  });

  it("SOURCE_TYPES includes speculation", () => {
    expect(SOURCE_TYPES).toContain("speculation");
    expect(SOURCE_TYPES).toEqual([
      "canon",
      "history",
      "invention",
      "speculation",
    ]);
  });

  it("PROVENANCE_KEYS is unchanged", () => {
    expect(PROVENANCE_KEYS).toEqual([
      "source_type",
      "source_title",
      "source_author",
      "source_url",
      "source_date",
      "source_id",
    ]);
  });
});
