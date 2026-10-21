import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionEvent } from "../bindings";

/**
 * Tracks the append-only session ledger for the active vault.
 *
 * Polls `list_session_events` on an interval, advancing a `since` cursor by the
 * latest event's `created_at` so each event is fetched once. The cursor is in
 * milliseconds (matching the backend's `timestamp_millis`), so events logged in
 * the same second as a prior poll are not skipped.
 */
export function useSessionLedger(vaultPath: string, pollIntervalMs = 2000) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const sinceRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!vaultPath) return;
    try {
      const newer = await invoke<SessionEvent[]>("list_session_events", {
        since: sinceRef.current,
      });
      if (newer.length === 0) return;
      setEvents((prev) => [...prev, ...newer]);
      const maxCreated = Math.max(...newer.map((e) => e.created_at));
      if (maxCreated > sinceRef.current) sinceRef.current = maxCreated;
    } catch (err) {
      console.error("Failed to list session events:", err);
    }
  }, [vaultPath]);

  useEffect(() => {
    setEvents([]);
    sinceRef.current = 0;
    if (!vaultPath) return;
    void refresh();
    const id = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(id);
  }, [vaultPath, refresh, pollIntervalMs]);

  /** Appends an event to the ledger and refreshes the local list. */
  const logEvent = useCallback(
    async (kind: string, payload: string) => {
      try {
        await invoke<string>("log_session_event", { kind, payload });
        await refresh();
      } catch (err) {
        console.error("Failed to log session event:", err);
      }
    },
    [refresh],
  );

  return { events, refresh, logEvent };
}
