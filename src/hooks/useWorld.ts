import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_NOTE_TYPES,
  DEFAULT_PROVENANCE_TAXONOMY,
  NoteType,
  ProvenanceType,
  WorldManifest,
  WorldTheme,
} from "../types";

/**
 * Named palette → CSS token overrides. Each palette maps to a small set of
 * token overrides for the Ledger's surface tokens. The 10% accent rule and
 * the rest-restraint rule hold in every palette — restraint is the platform.
 */
const PALETTES: Record<string, Record<string, string>> = {
  "obsidian-cold": {
    "--bg": "oklch(12% 0.01 250)",
    "--surface": "oklch(16% 0.012 250)",
    "--fg": "oklch(93% 0.006 250)",
    "--muted": "oklch(58% 0.012 250)",
    "--border": "oklch(24% 0.014 250)",
  },
  "pulp-warm": {
    "--bg": "oklch(97% 0.012 75)",
    "--surface": "oklch(99% 0.008 75)",
    "--fg": "oklch(22% 0.02 60)",
    "--muted": "oklch(50% 0.02 60)",
    "--border": "oklch(88% 0.02 75)",
  },
  default: {},
};

const SERIF_STACK =
  "'Iowan Old Style', 'Charter', Georgia, 'Times New Roman', serif";

/**
 * Loads the active world's manifest and exposes its note types, provenance
 * taxonomy, and theme. Applies theme CSS vars to `document.documentElement`
 * with resolution order: world tokens → global tokens → defaults.
 *
 * Scope is accent + palette + serif ONLY (no full typography override), per
 * the signed-off design. Cleanup resets the overridden vars to defaults when
 * the manifest is missing or the hook unmounts.
 */
export function useWorld(vaultPath: string) {
  const [manifest, setManifest] = useState<WorldManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!vaultPath) {
      setManifest(null);
      return;
    }
    invoke<WorldManifest>("get_world_manifest")
      .then((data) => {
        if (!cancelled) setManifest(data || null);
      })
      .catch((err) => {
        console.error("Failed loading world manifest:", err);
        if (!cancelled) setManifest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  const noteTypes: NoteType[] = useMemo(
    () =>
      manifest?.note_types?.length
        ? manifest.note_types
        : DEFAULT_NOTE_TYPES,
    [manifest],
  );

  const provenanceTaxonomy: ProvenanceType[] = useMemo(
    () =>
      manifest?.provenance_taxonomy?.length
        ? manifest.provenance_taxonomy
        : DEFAULT_PROVENANCE_TAXONOMY,
    [manifest],
  );

  const theme: WorldTheme = useMemo(() => manifest?.theme || {}, [manifest]);

  // Apply theme CSS vars to the document root.
  useEffect(() => {
    const root = document.documentElement;
    const applied: string[] = [];

    const apply = (name: string, value: string | undefined) => {
      if (value) {
        root.style.setProperty(name, value);
        applied.push(name);
      }
    };

    // Palette: world palette → global (no-op) → defaults (no-op).
    const palette = theme.palette || "default";
    const paletteTokens = PALETTES[palette] || PALETTES.default;
    Object.entries(paletteTokens).forEach(([name, value]) => apply(name, value));

    // Accent: world accent overrides --accent and derives --accent-hover.
    if (theme.accent) {
      apply("--accent", theme.accent);
      // Derive a hover shade by nudging lightness down ~7 points.
      const hover = theme.accent.replace(
        /oklch\(([\d.]+)%/,
        (_m, l: string) => {
          const n = Math.max(0, parseFloat(l) - 7);
          return `oklch(${n.toFixed(1)}%`;
        },
      );
      apply("--accent-hover", hover);
    }

    // Serif: optionally override --font-display.
    if (theme.serif) {
      apply("--font-display", SERIF_STACK);
    }

    return () => {
      applied.forEach((name) => root.style.removeProperty(name));
    };
  }, [theme]);

  return { manifest, noteTypes, provenanceTaxonomy, theme };
}
