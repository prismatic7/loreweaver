import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Activity centre log (F4.5).
 *
 * Consumes the app event bus (`loreweaver://activity`, mirrored from
 * `event_bus::emit`) into a bounded, in-memory ring buffer. Nothing is persisted
 * and nothing is sent anywhere — the centre answers "what just happened?" inside
 * this session, which is exactly what a busy save/sync loop needs and what a
 * toast cannot do without interrupting play.
 *
 * Two deliberate rules:
 * - **Bounded.** Old entries fall off at `limit`. An unbounded log during a long
 *   session is a leak with a friendly name.
 * - **Coalesced.** `vault-changed` fires for every file the watcher sees, often
 *   several times per save. Consecutive vault-changed entries inside
 *   `coalesceMs` fold into one row with a count, so the log stays readable.
 */

export interface ActivityEntry {
  /** Monotonic key for React lists. */
  key: number;
  /** Bus event name (`note_saved`, `vault-changed`, …). */
  event: string;
  /** Human label, derived once on receipt. */
  label: string;
  /** One-line detail from the payload, when the event carries something useful. */
  detail: string;
  /** Event timestamp in ms (from the backend envelope). */
  at: number;
  /** How many raw events this row represents (coalesced). */
  count: number;
}

interface ActivityEnvelope {
  event?: string;
  at?: number;
  payload?: Record<string, unknown> | null;
}

/** Human label + detail for one bus event. Unknown events stay honest. */
export function describeActivity(
  event: string,
  payload: Record<string, unknown> | null | undefined,
): { label: string; detail: string } {
  const p = payload ?? {};
  const str = (key: string) =>
    typeof p[key] === "string" ? (p[key] as string) : undefined;

  switch (event) {
    case "note_saved":
      return {
        label: "Note saved",
        detail: [str("title"), str("path")].filter(Boolean).join(" · "),
      };
    case "image_generated":
      return {
        label: "Image generated",
        detail: [str("prompt"), str("style")].filter(Boolean).join(" · "),
      };
    case "world_state_changed":
      return {
        label: "World manifest changed",
        detail: str("name") ?? str("world_id") ?? "",
      };
    case "dice_roll":
      return {
        label: "Dice roll",
        detail: [str("expression"), p.total !== undefined ? `= ${p.total}` : ""]
          .filter(Boolean)
          .join(" "),
      };
    case "session_event":
      return {
        label: "Session event",
        detail: str("kind") ?? "",
      };
    case "vault-changed":
      return { label: "Vault synced", detail: "" };
    default:
      return { label: event, detail: "" };
  }
}

export interface UseActivityLogOptions {
  /** Maximum entries kept. Older entries are dropped. */
  limit?: number;
  /** Consecutive same-event window that folds into one row. */
  coalesceMs?: number;
}

export function useActivityLog({
  limit = 200,
  coalesceMs = 2000,
}: UseActivityLogOptions = {}) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const nextKey = useRef(1);

  const append = useCallback(
    (event: string, payload: Record<string, unknown> | null | undefined, at: number) => {
      const { label, detail } = describeActivity(event, payload);
      setEntries((prev) => {
        const last = prev[0];
        if (
          last &&
          last.event === event &&
          at - last.at <= coalesceMs
        ) {
          const merged: ActivityEntry = {
            ...last,
            at,
            detail: detail || last.detail,
            count: last.count + 1,
          };
          return [merged, ...prev.slice(1)];
        }
        const entry: ActivityEntry = {
          key: nextKey.current++,
          event,
          label,
          detail,
          at,
          count: 1,
        };
        return [entry, ...prev].slice(0, limit);
      });
      setUnread((n) => n + 1);
    },
    [coalesceMs, limit],
  );

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const wire = async () => {
      const offActivity = await listen<ActivityEnvelope>("loreweaver://activity", (event) => {
        if (disposed) return;
        const envelope = event.payload ?? {};
        const name = envelope.event;
        if (!name) return;
        append(name, envelope.payload, Number(envelope.at) || Date.now());
      });
      unlisteners.push(offActivity);

      // The watcher emits its own Tauri event (not through the bus).
      const offVault = await listen("vault-changed", () => {
        if (disposed) return;
        append("vault-changed", null, Date.now());
      });
      unlisteners.push(offVault);
    };

    void wire().catch(() => {
      // No Tauri runtime (tests, plain browser preview): the log simply stays
      // empty rather than throwing during mount.
    });

    return () => {
      disposed = true;
      for (const off of unlisteners) off();
    };
  }, [append]);

  const markAllRead = useCallback(() => setUnread(0), []);
  const clear = useCallback(() => {
    setEntries([]);
    setUnread(0);
  }, []);
  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) setUnread(0);
      return !wasOpen;
    });
  }, []);
  const close = useCallback(() => setOpen(false), []);

  return { entries, unread, open, markAllRead, clear, toggle, close };
}
