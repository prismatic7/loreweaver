/**
 * The one-box intent router (⌘K).
 *
 * `parseIntent` is a pure function mapping a free-text query to an `Intent`
 * that the command palette executes. Routing:
 *   - `1d20+4` / `roll ...` → roll dice
 *   - `@capture <text>`     → capture a note
 *   - `/find <q>` or bare   → search the vault
 *   - `go <view>`           → navigate
 *   - `ask <q>` / "…?"      → Architect stream
 */
export type Intent =
  | { kind: "roll"; expression: string }
  | { kind: "capture"; text: string }
  | { kind: "find"; query: string }
  | { kind: "go"; view: string }
  | { kind: "ask"; query: string };

/** Matches a dice expression like `1d20+4`, `2d6`, `d20`, `3d8-1`. */
const DICE_RE = /^\d*d\d+/i;

export function parseIntent(input: string): Intent {
  const trimmed = input.trim();

  if (/^roll\s+/i.test(trimmed)) {
    return { kind: "roll", expression: trimmed.replace(/^roll\s+/i, "").trim() };
  }
  if (DICE_RE.test(trimmed)) {
    return { kind: "roll", expression: trimmed };
  }
  if (trimmed.startsWith("@capture ")) {
    return { kind: "capture", text: trimmed.slice("@capture ".length).trim() };
  }
  if (trimmed.startsWith("/find ")) {
    return { kind: "find", query: trimmed.slice("/find ".length).trim() };
  }
  if (trimmed.startsWith("go ")) {
    return { kind: "go", view: trimmed.slice(3).trim().toLowerCase() };
  }
  if (trimmed.startsWith("ask ")) {
    return { kind: "ask", query: trimmed.slice(4).trim() };
  }

  // Bare text defaults to search; a trailing question mark routes to the Architect.
  if (trimmed.endsWith("?")) {
    return { kind: "ask", query: trimmed };
  }
  return { kind: "find", query: trimmed };
}

/** A short human-readable label for the intent (shown as the palette's first row). */
export function describeIntent(intent: Intent): string {
  switch (intent.kind) {
    case "roll":
      return `Roll ${intent.expression}`;
    case "capture":
      return `Capture "${intent.text}"`;
    case "find":
      return `Search "${intent.query}"`;
    case "go":
      return `Go to ${intent.view}`;
    case "ask":
      return `Ask "${intent.query}"`;
  }
}
