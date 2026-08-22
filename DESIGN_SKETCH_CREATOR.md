# DESIGN SKETCH — THE CREATOR'S INSTRUMENT (Settings, Round 1 Devising)

Devising output (Hermes + Chris, 2026-08-22). From plumbing to craft: the
settings surface stops being "make the integrations work" and becomes
"shape the Muse". Bones, not spec — build decisions happen in phase 2.

## North Star (extended)

**The Tactile Ledger stays.** The design system is the house style; worlds
may redecorate (Arc 2). This sketch does not touch that.

**The problem:** today the app's settings are 100% infrastructure — which
model, which URL, which key. Creative control is spread across places the
user can't reach: the system prompt is a hardcoded string in `agent.rs`,
the campaign voice field exists in the backend but has no UI, the Bible is
always-on with no editor, image style is a literal string `"Fantasy
Portrait"` in `useAgent.ts`.

**The new test:** can the user make the Muse *feel* like the world —
without editing a JSON file or a Rust constant?

**Job statement:** settings is not the place where plumbing is configured;
settings is the place where the instrument is tuned. The GM is the player;
the Muse is the instrument; the world is the piece.

## The Shape: Three Tuning Knobs

The sketch proposes settings as three tiers, not one list:

1. **The Voice** (per world) — what the Muse believes it is, and what it
   always obeys. The Bible. The campaign system prompt.
2. **The Mouth** (cascade: global → world → session) — how output is
   rendered: image style template, output size, TTS voice. The difference
   between a portrait and a scene.
3. **The Temper** (cascade: global → world → session) — how predictable
   the model is: temperature, top_p, max_tokens, seed. The difference
   between "generate five plot hooks" and "generate five *weird* plot
   hooks".

### Design Principle: The Cascade

Every creative knob in this sketch follows one shape: **sensible global
default → per-world override → per-session quick toggle.**

The default is what a new user never thinks about (good defaults make
the app work before the user cares). The per-world layer is where the
world's identity lives — a cosmic-horror campaign runs cold, a pulp
campaign runs hot, and the *world* carries that, not the machine. The
per-session toggle is the instrument — the GM flips it in the moment,
mid-session, without opening settings.

Applied here: Temper (Firm ↔ Wild), image style template, and the Bible's
pin/unpin all follow this cascade. Settings is the deepest layer, not the
only one.

### Grounding: what exists today (verified 2026-08-22)

| Capability | Today | This sketch |
|---|---|---|
| LLM sampling params | none user-facing — `llm.rs` sends `{model, messages, stream}` only (Ollama), hardcodes `max_tokens: 4096` (Anthropic `llm.rs:174`) | temperature, top_p, max_tokens, seed in `AppSettings` + request bodies |
| Campaign system prompt | hardcoded in `agent.rs:79` | editable per world, wired to existing `VaultSettings.campaign_system` |
| Bible conditioning | always-on, 8 fixed files, no UI | Bible tab: surfaces conditioning notes, opens in normal editor, pin/unpin as play demands, toggle `world.bible` |
| World theme | manifest `world.json` only, hand-edited | manifest editor: palette (2 named today, extend), accent, serif |
| Image gen | style hardcoded `"Fantasy Portrait"`, ComfyUI steps 28/cfg 7/random seed | style template per world + note→image flow + quality (fast/standard/high), steps/cfg advanced-only |
| TTS/STT | provider + voice + path, no preview | voice preview button, STT model picker |
| Theme toggle | `useSettings.theme` is dead code — `setTheme` never wired | delete dead code or wire to a real light/dark toggle |

### Grounding: what is overcomplicated (verified)

- **`theme`/`setTheme` dead prop threading** — `SettingsView` receives
  `theme` as `_theme` and ignores it. Either the app gets a light/dark
  toggle (Design.md has a full light palette spec'd already) or the dead
  props are removed.
- **Right panel is build-info, not settings** — Credits/Licenses/Profile
  are static; Profile is a placeholder. Fine to keep, but it shouldn't
  masquerade as a settings surface.
- **`alert()` for save/reindex** — native dialogs break the Ledger's calm.
  In-app toast/inline feedback instead.
- **STT "base_url" doubles as model path** — label lies about the field.

## Domain 1 — The Voice (per world, priority 1)

The biggest creative lever in the product, currently invisible.

1. **System prompt / persona.** Wire `VaultSettings.campaign_system` into
   `agent.rs` (field already exists in `export_types.rs` + load/save
   commands — zero backend schema work). UI: a textarea in the world
   settings with a "reset to default" affordance. When set, it replaces
   the hardcoded opening line and is inserted before the RAG context
   block.
2. **Bible = pinned notes, not a settings store.** Principle: the vault is
   the source of truth. The conditioning notes are vital documents the GM
   reads while building and running the campaign — a copy inside settings
   would silently drift from the files the GM actually opens. And the
   Bible is *emergent*: a new world doesn't know its details yet, and play
   drags facts into the foreground. UI: a per-world Bible tab that lists
   the conditioning notes, opens each in the *normal note editor* (no
   textarea-in-settings), and lets any note be pinned/unpinned into the
   Bible as the campaign lives. `world.bible` stays as the always-on
   toggle. The settings surface organises and reveals; it never owns a
   second copy.
3. **RULES conditions register, not just tone.** The rules file is a
   first-class Bible voice: it enforces conventions and quirks of language
   and expectation — a 48-HD planar monster is still a shoggoth at a
   FATE of Cthulhu table. Treat RULES as equal conditioning weight to
   TONE, and surface it as such, not as "system config."

   *Voice bank (Arc 2's `world.json.voices`, seneschal/crow): dropped from
   this round. Nice to have, not a priority.*

## Domain 2 — The Mouth / Image (cascade: global → world → session, priority 2)

**Grounded note:** image generation today is a manual prompt box in the
right drawer (`useSessionTools.ts:50-53`) with a hardcoded default prompt
("A detailed portrait of Lirael, the elven mage") and a hardcoded style
string `"Fantasy Portrait"`. There is **no note-to-image flow at all**.
This domain is new flow, not just a settings field.

1. **Style template — the image voice.** Replace the hardcoded style
   string with a per-world **style template**: a small block of prompt
   text that sets aesthetics and tone (analogous to the campaign persona
   for text). Stored where the world's voice lives; `image.rs` already
   accepts a `style` string, so the template is prepended server-side.
   Example: *"Grainy cold-war espionage photo, muted green-grey palette,
   harsh practical lighting, 1970s intelligence dossier."*
2. **Note → image flow.** When the user generates an image for a thing
   (character, location, item), the prompt is assembled from:
   **the note for that thing** (its content is the source — same
   vault-is-source principle as the Bible) + **an optional per-use prompt**
   the GM adds. No more default "A detailed portrait of Lirael" —
   the description comes from the world's own records.
3. **Quality, not knobs.** Steps/cfg/seed stay out of the main UI.
   ComfyUI defaults hold (28 / 7 / dpmpp_2m / random). If anything, a
   single **quality** choice (fast / standard / high) maps to steps, and
   a seed toggle (random ↔ fixed) — advanced options, tucked away, not
   sliders pretending to be creative control. (Same reasoning as the
   Firm ↔ Wild relabel: the knob is predictability, not creativity.)
4. **Output size** for OpenAI (`1024x1024` hardcoded) and Stability.
5. **TTS voice preview** — a small "speak sample" button per voice,
   reusing the existing `generate_speech` backend. STT: file picker for
   the sherpa-onnx model dir instead of a text field labelled "base
   URL".

## Domain 3 — The Temper (cascade: global → world → session, priority 3)

The sampling knobs. One field set, applied in `llm.rs` to every provider.

**Design note (relabelled):** "temperature" is a physics word for a GM
tool. What it actually controls is *predictability* — low means the Muse
answers the same way every time (good for canon checks and session
summaries), high means it diverges and offers variation to react to. The
user's creativity stays at the controls either way; the dial just sets
how much variation arrives to be sifted. If built, label it
**"Firm ↔ Wild"** or *Predictability*, not Temperature.

**Why it stays in the list despite low personal need:** design is partly
imagining other users. A GM who wants a chaos engine for improv will dial
it up; a GM running a strict pre-written module may dial it down. The
knob is cheap to build (one field set, four request bodies) and the
*label* does most of the product work.

**The cascade applied (per The Cascade principle):**

1. **Sensible default** — ships set, nobody has to touch it.
2. **Per-world override** — the world's voice carries its own Firm ↔ Wild
   position (a cosmic-horror campaign runs cold, a pulp campaign runs hot).
   Stored with the world, like the persona.
3. **Per-session quick toggle** — a small Firm ↔ Wild control in the
   session header, so the GM flips it mid-session (canon check = firm,
   brainstorm = wild) without opening settings. This is the difference
   between a temperature field and an instrument.

- `llm_temperature` (0–2, slider, default ~0.8)
- `llm_top_p` (0–1, default 1.0)
- `llm_max_tokens` (default 4096)
- `llm_seed` (nullable — null = random, set = reproducible)

Schema addition is one `AppSettings` struct change + zod + body JSON in
the call sites (`call_ollama`, `call_openai_compatible`,
`call_anthropic`, `call_gemini`). UI: sliders/number inputs in the LLM
tab, not buried in the model field — labelled **Firm ↔ Wild**.

## What we are not doing (yet)

- **No plugin-driven settings schema.** Plugins stay permission-scoped;
   the settings form stays typed.
- **No multi-model "roster"** — one active LLM per install remains.
- **No settings sync / export-import of settings.** (World export exists;
   settings are machine-local.)
- **No conversation memory tuning** — session memory is its own system,
   out of scope.

## Open questions for phase 2

- Does the campaign voice live in `vault_config.json` (per world, stored
  in the world folder, travels with the world) or in the app DB (machine
  local)? Design.md says worlds should travel; recommend
  `vault_config.json` so it's part of the world.
- Temper default: what's the Muse's *house* position? 0.8 is the
  generator's default; the GM probably wants ~0.9-1.0 for creative
  sessions and ~0.3 for canon checks. Resolved by the cascade: global
  default → per-world → per-session toggle. The open question is only
  the default number.
- Style template placement: per-world (so a cosmic horror world always
  draws bone-white) or global-with-override? The cascade suggests
  per-world, consistent with the persona; confirm in phase 2.
- Where does the per-world Temper override live? Same question as the
  campaign voice: `vault_config.json` (travels with the world) is the
  recommendation — confirm it shares the persona's storage.
- Per-session quick toggle semantics: does it reset when the session
  closes, or persist as the world's new default until changed? Lean:
  ephemeral by default (a session is a sitting at the table), with an
  optional "make this the world default" affordance.
