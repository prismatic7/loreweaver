# Overnight Loop — Round 2: Increments D + E

> Scoped 2026-08-28 with Chris (interactive session). Same shape as the
> A→B→C round: three bounded, committable increments with green-gate
> acceptance criteria. Red lines from the parent plan apply unchanged.

## Pre-flight (both increments)

- Gates after each increment: `npm run lint`, `npm run build`,
  `NODE_ENV=test npm run test`, `npm run verify-docs`,
  `cargo test --locked -- --skip test_api_key_round_trip`.
- Do NOT git push (Chris pushes after review). Commit locally on main.
- No new plugin permissions. No vault writes outside `validate_safe_path`.
- No command signature changes; new commands must be added to the API
  reference + `npm run verify-docs` must pass.
- Build gotcha: `NODE_ENV=development npm install` before frontend builds.

---

## Increment D — UI polish & calm (Phase 5, revised scope)

> Revised 2026-08-28: canvas WebSocket collaboration is REMOVED from this
> increment (parent plan flagged it for splitting; it is now its own future
> arc, not overnight work). In its place: the Ledger-calm debt from the
> Creator's Instrument audit (native `alert()` sweep) and the Muse arc's
> one known gap.

### D1: Keyboard-first navigation
- [x] `Ctrl/Cmd+K` command palette: fuzzy jump to note (reuse Increment B's
  fuzzy matching), to view, and to recent notes. New component
  `src/components/CommandPalette.tsx` + test.
- [x] `Ctrl/Cmd+S` saves the active note (currently editor-dependent).
- [x] Palette opens from a small affordance in the header too (discoverable,
  not keyboard-only).
- **Gate:** GM navigates the whole app without touching the mouse for nav.
  (Landed `9167469`; gate is a manual GM check.)

### D2: The alert() sweep (Ledger's calm)
- [x] Replace every native `alert()` in `src/components/` with the in-app
  toast/inline pattern (the pattern Increment C used for drawer feedback, or
  a minimal shared `useToast` if none exists — do not add a dependency).
- Files with alerts (measured 2026-08-28): `SettingsView.tsx` (2),
  `CharacterSheetView.tsx` (6), `FolderCanvas.tsx` (2), `MapBuilderView.tsx`
  (6). Grep-verified; sweep must end with `grep -rn "alert(" src/components`
  returning zero.
- **Gate:** no native dialogs anywhere; tests updated. (Landed `1e2d56e`.)

### D3: Muse gap close — "make this the world default"
- [x] Session Firm↔Wild toggle in `AiView.tsx` gains the sketch's promised
  "make this the world default" affordance: persists the current session
  value into the active world's `vault_config.json` via existing
  `save_vault_settings`. Confirm-first inline affordance, not a modal.
- **Gate:** flip → make default → reload → world override holds. (Landed
  `156ab5f`; gate is a manual GM check.)

### D4: Mark Increment F done (admin, no code)
- [x] Confirm GitHub Actions CI runs green on the latest pushed commit
  (Hermes verifies via `gh run list` if available; otherwise note as
  Chris-action). Update the roadmap doc: F complete, D complete.
- **Note:** CI was red on the last pushed commit (35ef855) for two
  pre-existing infra reasons — absolute local paths in docs (verify-docs) and
  missing GTK deps on the backend job. Both fixed in D4; see the F plan's
  "CI red-light fixes" section. F's phase gate is now fully checked.

---

## Increment E — Automation & scripting (Phase 6)

Unblocked: the Increment A event bus (`event_bus.rs`, events emitted at
`lib.rs:400,1351,2121`) is live. This increment is backend-heavy Rust.

### E1: World scheduler (`schedule.yaml` + cron-style dispatch)
- [ ] New module `src-tauri/src/scheduler.rs`: reads `<vault>/schedule.yaml`
  (schema documented in the module header), checks due entries on app
  launch + on a timer, dispatches world-event hooks through the plugin
  event bus (`emit`).
- [ ] Entries carry `on:` (interval or daily time), `action: emit_event`
  (name + payload) and, if the Muse arc's persona is set, an optional
  `prompt:` that requests one nightly generation into a target note via
  `validate_safe_path`-guarded write.
- [ ] Manual trigger: a `run_schedule_now` command (dev/testing affordance
  and GM "roll tonight's events" button).
- [ ] No new dependency beyond `serde_yaml` if not already present.
- **Gate:** a test vault with a nightly hook produces the event without
  manual steps (integration test, clock-injected, no real waiting).

### E2: Expression engine (dice + values)
- [ ] New module `src-tauri/src/expr.rs`: a SMALL, safe expression evaluator
  (dice notation `3d6+2`, arithmetic, `max/min`, comparison). NO `exprtk`
  dependency — hand-rolled parser with unit tests, same style as
  Increment B's hand-rolled levenshtein. No filesystem, no network, no
  plugin access — it computes numbers, nothing else.
- [ ] Exposed as a Tauri command `evaluate_expression(vault_path, expr)` and
  surfaced in the session UI as a `/roll` chat affordance.
- **Gate:** `/roll 3d6+2` in session chat returns a roll; malformed input is
  a clean error; the parser cannot be tricked into anything but numbers.

### E3: World-event hook for plugins
- [ ] Scheduler emissions and `/roll` results go through `event_bus::emit`
  so plugins can subscribe (e.g. a weather plugin reacting to a nightly
  event). Document the two new event names in the plugin authoring guide.
- **Gate:** a test plugin hook receives a schedule event (integration test
  in the existing plugin test style).

---

## Sequencing this round
D2 → D3 → D1 → D4 → E1 → E2 → E3. D-first because D2/D3 are small,
user-visible, and close debts from the Muse arc; E1 is the longest pole.
Each increment is independently committable — if the night stops early,
land what's green.

## Red lines (unchanged from the A→B→C round)
- No plugin permission widening; no git push; no history rewrites; no web
  search; no delegation.
- Expression engine must not gain file/network/plugin reach — numbers only.
- Scheduler writes only inside the vault, only via `validate_safe_path`.