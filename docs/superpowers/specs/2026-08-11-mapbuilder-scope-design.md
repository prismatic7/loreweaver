# Design: MapBuilder — Scope Brief (Maps, Tokens, Drawings)

**Date:** 2026-08-11
**Status:** **Implemented** — closed 2026-08-11 (commit `318762a`, "feat(map): image backgrounds, drawing layer, token palette + shapes")
**Slice:** MapBuilder scoping — what a map is, what tokens do, what we build now vs. defer

## Overview

The MapBuilder view currently supports: image-less grid canvas, pan/zoom, draggable
tokens (label/select/delete), fog-of-war regions (toggle), and a ruler. This brief
settles the *purpose* of maps in Loreweaver and scopes the next build slice.

Three decisions from the design conversation with Chris:

1. **A map is any of: battle map, region/world map (zoomed out), location map (zoomed in).**
   The zoom level *is* the map type. Hierarchy between maps is **emergent** — you create
   as many map canvases as you need and link them with wiki-links (castle map → floor maps
   → battle maps). No map-tree UI, no parent/child schema.
2. **Tokens are things you move around the map.** Simple, functional markers. No
   character-sheet binding, no stat blocks, no token↔note linking in this slice.
3. **A map is a different kind of canvas from the folder canvas.** Folder canvas is a
   mind map — connections, groupings, clustering notes about a thing. A map is spatial.
   They remain separate asset kinds; no unification.

## Principles

- **Map editor, not campaign cartographer.** There are many full map editors; Loreweaver's
  map is a lightweight spatial surface for play, not a cartography tool.
- **Emergent hierarchy.** World → region → location → battle is a spectrum of zoom, not a
  data model. Linking maps is done with existing wiki-link mechanics.
- **YAGNI.** Distance measurement is deferred because it is scale-dependent and would drag
  in calibration UI. Fog stays a simple toggle; no reveal mechanics.
- **Session-resilient drawings.** GM annotations (spell effects, boundaries) persist with
  the map so they survive a session restart, with a one-click clear for the end-of-encounter
  wipe.

## Build Now (3 items)

> **Implemented 2026-08-11** in commit `318762a`. Gates: 91/91 tests, build ✓.
> MapData extended backward-compatibly: `background?: MapBackground | null`,
> `drawings?: MapDrawings`. Old map files load with `background: null` and
> empty drawings.

### 1. Image background import

The one genuinely new capability.

- File picker → image stored in the vault (existing `_assets/` convention) → referenced by
  the canvas file.
- Background renders under the grid, scales/positions with pan/zoom.
- Grid remains toggleable over the image (useful for battle maps; off for world maps).

**Implemented:** `BG` toolbar button → `save_note_asset` (co-located `_assets/` beside the
map file) → natural dimensions measured via `new Image()` at import → `<image>` rendered
under grid/fog/tokens, `fitToView` accounts for background bounds. Grid toggle button added.

### 2. Drawing layer

- **Lines** — spell effects, temporary boundaries, travel routes. Stroke colour + width,
  drawn on the canvas, saved with the map.
- **Text annotations** — short labels/notes placed on the map, saved with the map.
- **Clear drawings** action — one-click wipe for the end-of-encounter reset.

**Implemented:** draw mode (click-to-place polyline, Finish/Cancel), annotate mode
(click map → inline input → haloed accent text), `Clear Drawings` button. Persisted in
`MapData.drawings`. Modes are mutually exclusive (ruler/draw/annotate toggle each other
off).

### 3. Token palette polish

Tokens already exist (drag/select/delete/label). Small pass:

- **Token palette** — drop the same marker repeatedly without re-adding each time.
- **A few shapes** (circle/square/star) for different token kinds (PCs, NPCs, monsters,
  landmarks).

**Implemented:** bottom-left palette of distinct (label/shape/colour) markers (cap 8,
most recent first); shape picker in the token naming overlay; shapes persist per token.

## Keep As-Is (already built)

- Grid, pan/zoom, fog toggle, ruler.
- Ruler stays a rough measure tool — **uncalibrated**. No real-unit calibration until
  actually needed at the table.

## Explicitly Deferred (the "not a cartographer" list)

- Scale calibration / real distance units.
- Map hierarchy UI (tree, parent/child).
- Fog-of-war reveal mechanics (keep the simple toggle).
- Token ↔ note / character-sheet linking.
- Layers, multiple backgrounds, map export.

## Implementation Order

1. Image background import (backend asset path + frontend render).
2. Drawing layer (lines + annotations + clear).
3. Token palette + shapes.
4. Test + build gate, commit.

## Open Questions (defaults in place unless Chris objects)

- **Ruler:** keep uncalibrated (default) vs. remove.
- **Drawings persistence:** save with map + clear button (default) vs. session-only.
