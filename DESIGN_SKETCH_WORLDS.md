# DESIGN SKETCH — WORLD OBJECTS (Round 2 Devising)

Phase 1 devising output (Hermes + Chris, 2026-08-10, evening session).
Arc 2 of the loreweaver pipeline: from one campaign tool to an instrument
for many worlds. Bones, not spec — build decisions happen in phase 2.

## North Star (extended)

**Arc 1: the shoggoth.** One world absorbs ideas, grows dense, generates
from its own DNA.

**Arc 2: the shoggoth field.** Loreweaver is not a campaign manager; it is
an instrument for *many worlds at once*. Each world is its own shoggoth —
its own body (vault), its own form (graph), its own mind (Architect), its
own voice. The user is not a GM running a folder; the user is a
worldwright tending a field.

**The core test, unchanged:** does this help ideas land, grow, and connect?

**New test, per world:** does this world *feel* like itself? A fantasy
vault and a spy-thriller vault should not feel like reskins of the same
app — they should feel like different instruments.

**Job statement:** the app's job is not storing worlds. It is making
worlds answer back — each on its own terms.

## The World Object

The unit that carries ownership and plurality is one thing: **the World
Object**. A world is a folder (`campaigns/<world>/`) with a manifest
(`world.json`) that declares its identity. Today the folder exists but the
object does not — no manifest, no switcher, no identity.

### What a world declares

```jsonc
{
  "id": "fate-of-cthulhu",
  "name": "FATE of Cthulhu",
  "description": "2003 espionage-horror. Pyramid Security Analysis.",
  "icon": "🜁",                        // or an image asset
  "theme": {
    "palette": "obsidian-cold",        // named token set, or inline overrides
    "accent": "oklch(45% 0.12 340)"    // default rust overridden per world
  },
  "note_types": [                       // replaces hardcoded 5
    { "id": "npc",         "label": "Person",     "color": "oklch(60% 0.22 340)" },
    { "id": "location",    "label": "Place",      "color": "oklch(65% 0.2 260)" },
    { "id": "faction",     "label": "Org",        "color": "oklch(60% 0.15 80)" },
    { "id": "item",        "label": "Object",     "color": "oklch(70% 0.18 140)" },
    { "id": "event",       "label": "Beat",       "color": "oklch(75% 0.15 320)" },
    { "id": "clue",        "label": "Clue",       "color": "oklch(55% 0.2 45)" }
  ],
  "provenance_taxonomy": [              // replaces hardcoded canon/history/invention
    { "id": "canon",      "label": "Canon" },
    { "id": "history",    "label": "History" },
    { "id": "invention",  "label": "Invention" },
    { "id": "speculation","label": "Speculative" }   // the Provisional, per-world
  ],
  "voices": {                           // per-world TTS voice bank
    "seneschal": "alloy",
    "crow":      "onyx"
  },
  "bible": true,                        // bible/ conditioning active (default)
  "created": "2026-08-10"
}
```

### Grounding: what exists today (verified)

| Capability | Today | World Object |
|---|---|---|
| World storage | `campaigns/<name>/` + per-world DB, live switch | same spine, now *visible* via manifest |
| Note types | hardcoded 5 in `EntityGraphView.tsx:36-42` | registry from `world.json`, fallback to defaults |
| Provenance | `SOURCE_TYPES` hardcoded in `types.ts:52` | per-world taxonomy, fallback to defaults |
| Theme | global DESIGN.md tokens | per-world token overrides on top of the Ledger default |
| Conditioning | `<vault_path>/bible/` always-on | confirmed world-scoped — manifest just declares it |
| Voices | global TTS settings | per-world voice bank (future phase) |

## Domain 3 — Making it their own (priority 1)

The world manifest IS the ownership layer. The user does not customise the
app; the user writes each world's operating system.

1. **Theme per world.** The Tactile Ledger stays the default design system
   (per DESIGN.md), but a world can override palette + accent + typography
   tokens. A cosmic-horror world runs cold obsidian and bone; a pulp world
   runs warm paper and rust. The Ledger is the *house style*; worlds may
   redecorate. (Design rule to preserve: the 10% accent rule and the rest
   restraint rule hold in every theme — restraint is the platform, not the
   palette.)
2. **Note types per world.** The graph, canvas, filters, and metadata UI
   all read from `world.json.note_types`. A fantasy world adds `spell`,
   `house`, `lineage`; a thriller adds `clue`, `cover`, `asset`. Fallback
   to the current 5 keeps existing vaults working.
3. **Provenance per world.** "canon/history/invention" is the FATE-of-
   Cthulhu taxonomy, not the universal one. A world declares its own —
   `scripture/rumour/apocrypha`, `established/pending/retconned`,
   `observed/reported/imagined`. The graph filter and source nodes follow
   the world's taxonomy.
4. **Voice bank per world.** NPCs are voiced by the world's cast, not a
   global dropdown. The seneschal speaks; Pyramid HR speaks; another world
   has entirely different voices. (TTS exists today — this is registry +
   UI, future phase.)
5. **The bible as DNA, per world.** Already per-vault. The manifest names
   it. The Muse is conditioned by *this* world's bible — confirmed working
   in arc 1.

## Domain 4 — The many worlds (priority 2)

1. **Worlds as first-class objects.** A switcher with identity — icon,
   colour, description, last-opened — not a folder dropdown. The current
   vault-switch mechanism (`Mutex<String> vault_path`) becomes the spine
   of a World Shelf.
2. **The Liminal.** `campaigns/_liminal/` — the shared holding pen *between*
   worlds. Ideas not yet assigned to a world: "this character belongs to
   something, I don't know which world yet." The place where new worlds
   gestate. It is not a world; it is the attic of the field.
   - Captures default here until routed to a world.
   - A liminal note can be *claimed* by a world (moved in, linked).
   - A liminal cluster that thickens is the seed of a new world — "make
     this a world" is a one-click birth.
3. **World bundles.** Export a world as a portable bundle: `world.json` +
   `bible/` + notes + voices + theme tokens. One folder, self-describing.
   - Import = validate manifest, land folder, done.
   - Archive a finished campaign; restore it later.
   - Share a *shape*: a world scaffold with structure but no content —
     "start a new world like this one" produces shape, not copy.
   - The shoggoth travels.

## Domain 2 — QoL that improves thinking and writing (priority 3)

These are app-level moves, listed here because they multiply the World
Object's power:

1. **Muse in the text.** Select a passage in the editor → invoke the Muse:
   *develop this*, *what's the complication?*, *give me three turns*.
   Inline, conditioned by the world's bible — the world answers inside
   the writing, not in a side chat. (Muse tab exists as scaffold; this is
   the inline extension.)
2. **The world remembers.** Auto post-session capture: the table session
   lands in the world's `SESSION_LOG.md` automatically (arc 1 flagged this
   as a gap — `summarize_session` exists, persistence is manual).
3. **The Provisional.** The `speculation` provenance state (per-world
   taxonomy) makes contradiction safe: draft an idea as speculative and it
   sits beside canon without polluting it. The world can hold many
   versions at once — that is what imagination is. (Arc 1's provenance
   model is "depth depth depth" — this is the killer application of it.)
4. **Versioned ideas.** Note history as archaeology — see how a concept
   evolved. The villain was once an ally; that is a story, and the ledger
   should keep it. (Future phase; note the intent now.)
5. **The threshold.** Capture reach beats capture speed: the mouth should
   be a global hotkey away. (Live STT remains on the arc-1 backlog; the
   Liminal is the immediate capture default.)

## Domain 1 — The imaginative space (priority 4)

Ranks last per Chris's order, but completes the instrument:

1. **The Board.** The entity graph becomes a conspiracy board you think
   with, not a diagram you look at: cluster by *question* ("everything
   connected to Neft Daşları"), pin the red thread, drag freely. (Arc 1
   flagged static layout — force/drag remains a build item; clusters-as-
   questions is the interaction design on top.)
2. **The Thread.** A reading path through the graph — follow a connection
   as a trail of notes. Hypertext as investigation. "Show me the trail
   from the cold open to the seneschal."
3. **The Provisional** (see Domain 2.3) is also the imaginative space's
   core move — safe contradiction is what lets a world *breathe*.

## Architecture deltas (phase 2 scope)

1. **`world.json` schema + loader.** Rust module: `worlds.rs` — read,
   validate, fallback chain (manifest → defaults). Schema v1 as above.
   Existing campaigns get a generated default manifest on first launch
   (no data migration — the folder already is the world).
2. **Note-type registry.** Frontend graph/canvas/metadata read types from
   the active world's manifest; `TYPE_COLORS` becomes the default set.
   Existing notes with the 5 legacy types keep working (they're in the
   default set).
3. **Provenance taxonomy override.** `SOURCE_TYPES` constant becomes the
   default; the sources UI + graph filter read the world's taxonomy.
   `speculation` ships in the default taxonomy (Provisional, on by default).
4. **Theme override.** Design tokens resolve as: world tokens → global
   tokens → defaults. CSS vars carry the resolution. First cut: accent +
   palette + optional serif toggle. Full typography override later.
5. **The Liminal.** Special-case `campaigns/_liminal/`: capture default,
   claim/route action, "make this a world" birth action. Hidden from the
   world shelf as a world; visible as its own entry ("the Liminal").
6. **World bundles.** Export: zip the world folder (+ manifest). Import:
   validate manifest, unzip, land. Scaffold export: world.json + bible
   skeleton + empty structure, no content.
7. **World Shelf UI.** Switcher replacing/augmenting the vault switcher:
   icon, name, description, last-opened, "new world" (with scaffold
   choice), Liminal entry, export/import actions.

## Out of scope (future phases, logged not built)

- Muse-in-text inline invocation (Domain 2.1)
- Auto post-session capture (Domain 2.2) — arc 1 backlog item, still open
- Voice bank UI (Domain 3.4)
- Versioned note history (Domain 2.4)
- Live STT (arc 1 backlog)
- Interactive graph layout + clusters-as-questions + the Thread (Domain 1)
- Era-hopping timeline (arc 1 backlog)

## Resolved decisions (this session, second pass — Chris signed off all six)

1. **Theme scope in phase 2:** accent + palette + serif toggle. No full
   typography override yet — typography overrides are fiddly and
   low-value at first; the Ledger's type system stays default.
2. **Migration:** auto-generate `world.json` for existing campaigns with
   defaults on first launch. Zero-touch; no manual creation step.
3. **Liminal naming:** `_liminal` — underscore signals a system folder,
   hidden from the shelf as a world, visible as its own entry.
4. **Bundle format:** zip for export/import/archive; plain folder for
   scaffold ("start a new world like this one").
5. **Registry UI in phase 2:** file-first — edit `world.json`, app
   hot-reloads. Forms UI comes after the manifest proves itself.
6. **Speculation as default provenance:** YES — `speculation` ships in
   the default taxonomy for ALL worlds. The Provisional is core to the
   instrument, not a per-world add-on.

## Original open questions (now resolved)

1. **Theme scope in phase 2:** full token override (palette + accent +
   typography) or accent + palette only? → **accent + palette + serif
   toggle (resolution 1 above).**
2. **Migration:** auto-generate `world.json` for existing campaigns with
   defaults on first launch (recommended — zero-touch), or manual
   creation? → **auto-generate (resolution 2).**
3. **Liminal naming:** `_liminal` (underscore signals system folder,
   recommended) vs `Liminal` vs `.liminal` (hidden)? → **`_liminal`
   (resolution 3).**
4. **Bundle format:** zip (portable, recommended) vs plain folder copy
   (git-friendly)? → **zip for export, folder for scaffold
   (resolution 4).**
5. **Note-type registry UI in phase 2:** manifest-editing UI (forms) or
   file-first (edit world.json, app hot-reloads, recommended for phase 2)?
   → **file-first (resolution 5).**
6. **Speculation as default provenance:** add `speculation` to the default
   taxonomy for ALL worlds (recommended — the Provisional is core), or
   only when a world declares it? → **default for all worlds
   (resolution 6).**

## Resolved decisions (this session)

1. **Priority order:** making it their own (3) → many worlds (4) → QoL (2)
   → imaginative space (1). The World Object carries 3+4 as one system.
2. **The World Object is the unit.** Not per-world settings bolted onto a
   global app — a manifest that IS the world's operating system.
3. **The Liminal exists** — the between-worlds attic, capture default,
   birthplace of new worlds.
4. **World bundles travel** — export/import/archive/scaffold.
5. **Pipeline it** — this sketch is the round-2 devising artifact; phase 2
   build dispatches from it through the standard governance model.
