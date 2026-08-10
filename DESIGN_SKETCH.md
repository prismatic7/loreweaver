# DESIGN SKETCH — FATE of Cthulhu Campaign Tool

Phase 1 devising output (Hermes + Chris, 2026-08-10). Bones, not spec.
Build decisions get made in phase 2; this is the shape of the thing.

## North Star

**The shoggoth.** The tool's job is integration, not generation. Years of
scattered ideas — notebooks, voice memos, old campaign notes, half-formed
mysteries — land in the vault, get linked, and the world grows denser.
Every capture is absorbed; every link is a tendril; every generation is
born FROM the world, carrying its DNA.

Test for every design decision: *does this help the ideas land, grow, and
connect?*

## Campaign

- **Game:** FATE of Cthulhu (Evil Hat). First real campaign.
- **Frame:** 2003 espionage-horror. Players are employees of Pyramid
  Security Analysis (Brussels), a private security contractor. Dispatched
  Doha → Bangalore → Karachi → Kabul, investigating events that reveal
  Yog-Sothoth, the Key and the Gate, is close to manifestation in Neft
  Daşları, Azerbaijan.
- **Cold open:** the blasted wasteland, the vast bandaged figure crossing
  the plateau — 'Umr at-Tawil, the seneschal. The end state the players
  are racing to prevent.
- **Tone line:** "If you laugh, it's to keep from screaming." "The house
  always wins. The good is the enemy of the pragmatic, and will always,
  always lose."
- **Touchstones (filter bank):** Declare (Powers); Tinfoil Dossiers
  (Kiernan); A Colder War (Stross); The City and the City (Miéville);
  late le Carré; Utopia (Kelly); Hellblazer (Delano); Blick's thrillers.
  Each is a lens generation passes through, not a reading list.

## Campaign Bible (vault structure)

```
bible/
├── TONE.md          — the voice, the tone line, what this world feels like
├── TOUCHSTONES.md   — the filter bank, one line per lens
├── THE_PLAN.md      — the mythos plan: phases, eras, doom clock (DOES NOT
│                      EXIST YET — research first, then generated with the Muse)
├── CONSPIRACY.md    — the map: Pyramid Security Analysis, the nodes, the pattern
├── PEOPLE.md        — the roster: Titus Crow, colleagues, cultists, the seneschal
├── PLACES.md        — locations: Doha, Bangalore, Karachi, Kabul, Neft Daşları
├── RULES.md         — FoC mechanics: Doom economy, era-hopping, plan structure
└── SESSION_LOG.md   — what happened, what's open, what's next
```

## Capture Surfaces (where Chris researches)

1. **Browser** — Lovecraft texts, 2003 history, Neft Daşları, FoC SRD
2. **Books & comics** — physical; Hellblazer, le Carré, the touchstones
3. **PDFs** — FoC rulebook, touchstone books, public-domain texts
4. **Scratchpad** — quick capture, any format, any moment
5. **Campaign vault** — the destination; everything lands here, linked

## Capture Design

- **The inbox (scratchpad) is the shoggoth's mouth.** One place, always
  open, accepts anything: text, paste, URL, voice, file drop. Things land
  first, get triaged, get linked. Frictionless landing is the priority.
- **Source-aware import.** PDFs and web clips carry provenance: title,
  author, source, date. The entity graph shows sources as nodes. For a
  research-driven campaign you must distinguish canon (Lovecraft), history
  (2003), and your own invention.
- **Live dictation.** STT from the mic, not file upload. The couch moment:
  "the Gate is the border between..." lands as a note. (Recon: STT is
  file-upload only — build item.)
- **Linking as default.** Every capture gets linked: to the conspiracy, a
  person, a place, a touchstone. The web grows; the shoggoth blooms.

## Generation Conditioning

- **The bible is always-on conditioning.** Not retrieved-by-similarity —
  always injected into the Architect's context, so the Muse can't generate
  off-tone even when the query is vague.
- **Touchstones as filter bank.** Generation passes through the lenses.
- **The plan grows from research.** The Muse proposes phases and eras FROM
  the absorbed material; Chris shapes them. Not a generic Cthulhu generator.

## Era-Hopping Model

- The timeline is the campaign's spine (FoC is architectural: the GOO's
  plan across time, investigators jumping eras).
- Eras as first-class objects: 2003 (the frame) and the blasted future
  (the end state), with the jumps between them.
- The doom clock: the wasteland vision is the Doom made image.

## Build Items (from recon, phase 0)

- **Commit the docs** — DESIGN.md, PRODUCT.md, FEATURE_PROPOSAL.md are
  untracked → invisible to agents in worktrees. THE docs problem, solved
  mechanically. Also: AGENTS.md test claims are stale (tests exist).
- **Live STT** — mic dictation (speech.rs local STT unimplemented).
- **Era-hopping timeline** — eras as first-class, era-switch navigation.
- **Interactive entity graph** — force layout, drag, zoom (static circle now).
- **Auto post-session capture** — session memory is manual now.
- **Bible conditioning** — always-on injection into build_system_context.
- **Capture inbox** — first-class scratchpad surface.

## Resolved Decisions (Chris, 2026-08-10)

1. **Provenance: depth depth depth.** As rich and customizable as possible.
   Source nodes in the entity graph (canon / history / invention as default
   taxonomy, user-definable). Every capture carries provenance: title, author,
   source, date, type. Filtering by provenance is a first-class interaction:
   "show me only canon", "show me what's connected to Neft Daşları".
2. **Web clipping: app pulls the page.** In-app fetch → readability extraction
   → markdown note with provenance (URL, site, fetch date). No paste-URL
   cop-out; the app does the work.
3. **PDFs: import → markdown.** The FoC rulebook, Lovecraft texts, touchstone
   books all land as clean, readable markdown notes with provenance. No raw
   text dumps. "Keep everything attractive and easy to read" is a design
   principle: the vault stays beautiful.
4. **Comics: images AND text.** Hellblazer's visual texture matters. Image
   attachments are first-class captures, linked to notes, viewable in the
   vault. The Tactile Ledger holds pictures too.
5. **The Muse is everywhere.** Not a view — a persistent sidebar tab, present
   in every view (timeline, graph, canvas, editor, search), a click away,
   never front-and-centre. Context-aware: when you're in the timeline it knows
   you're looking at the timeline. The stage manager is in every room.

## Open Questions

- Where does the Muse live: Architect chat, or a dedicated generation view?
  → **RESOLVED: sidebar tab in every view.**
- Provenance model: how deep?
  → **RESOLVED: depth depth depth — source nodes, customizable taxonomies.**
- Web clipping: in-app fetch, or paste-URL flow?
  → **RESOLVED: in-app fetch, app pulls the page.**
- PDF pipeline: index PDFs directly, or import → markdown notes?
  → **RESOLVED: import → markdown, attractive and easy to read.**
- Comics: capture as images + notes, or text only?
  → **RESOLVED: images and text.**
