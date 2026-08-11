import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWorld } from "./useWorld";
import {
  DEFAULT_NOTE_TYPES,
  DEFAULT_PROVENANCE_TAXONOMY,
  WorldManifest,
} from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

const manifest: WorldManifest = {
  id: "fate-of-cthulhu",
  name: "FATE of Cthulhu",
  description: "2003 espionage-horror.",
  icon: "🜁",
  theme: {
    palette: "obsidian-cold",
    accent: "oklch(45% 0.12 340)",
    serif: true,
  },
  note_types: [
    { id: "npc", label: "Person", color: "oklch(60% 0.22 340)" },
    { id: "clue", label: "Clue", color: "oklch(55% 0.2 45)" },
  ],
  provenance_taxonomy: [
    { id: "canon", label: "Canon" },
    { id: "speculation", label: "Speculative" },
  ],
  bible: true,
  created: "2026-08-10",
};

describe("useWorld", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    document.documentElement.style.cssText = "";
  });

  it("falls back to defaults when no manifest is loaded", () => {
    mockInvoke.mockResolvedValue(null);
    const { result } = renderHook(() => useWorld("/vault"));
    expect(result.current.noteTypes).toEqual(DEFAULT_NOTE_TYPES);
    expect(result.current.provenanceTaxonomy).toEqual(
      DEFAULT_PROVENANCE_TAXONOMY,
    );
    expect(result.current.theme).toEqual({});
  });

  it("uses manifest note types and provenance taxonomy when present", async () => {
    mockInvoke.mockResolvedValue(manifest);
    const { result } = renderHook(() => useWorld("/vault"));
    await waitFor(() => {
      expect(result.current.manifest).toEqual(manifest);
    });
    expect(result.current.noteTypes).toEqual(manifest.note_types);
    expect(result.current.provenanceTaxonomy).toEqual(
      manifest.provenance_taxonomy,
    );
  });

  it("applies world theme tokens over global defaults", async () => {
    mockInvoke.mockResolvedValue(manifest);
    const { result } = renderHook(() => useWorld("/vault"));
    await waitFor(() => {
      expect(result.current.manifest).toEqual(manifest);
    });

    const root = document.documentElement;
    // Palette tokens applied
    expect(root.style.getPropertyValue("--bg")).toContain("oklch");
    // Accent applied
    expect(root.style.getPropertyValue("--accent")).toBe(
      "oklch(45% 0.12 340)",
    );
    // Serif applied
    expect(root.style.getPropertyValue("--font-display")).toContain("serif");
  });

  it("cleans up theme vars when manifest is missing", async () => {
    mockInvoke.mockResolvedValue(manifest);
    const { result, unmount } = renderHook(() => useWorld("/vault"));
    await waitFor(() => {
      expect(result.current.manifest).toEqual(manifest);
    });
    expect(
      document.documentElement.style.getPropertyValue("--accent"),
    ).toBeTruthy();

    unmount();
    expect(
      document.documentElement.style.getPropertyValue("--accent"),
    ).toBe("");
  });

  it("reloads manifest when vaultPath changes", async () => {
    mockInvoke.mockResolvedValue(manifest);
    const { result, rerender } = renderHook(({ path }) => useWorld(path), {
      initialProps: { path: "/vault-a" },
    });
    await waitFor(() => {
      expect(result.current.manifest).toEqual(manifest);
    });

    mockInvoke.mockResolvedValue(null);
    rerender({ path: "/vault-b" });
    await waitFor(() => {
      expect(result.current.manifest).toBeNull();
    });
    expect(result.current.noteTypes).toEqual(DEFAULT_NOTE_TYPES);
  });
});
