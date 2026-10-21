import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useActivityLog, describeActivity } from "./useActivityLog";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

type Handler = (event: { payload: unknown }) => void;

/** Captures the handlers the hook registers, keyed by event name. */
function captureHandlers(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  vi.mocked(listen).mockImplementation(((name: string, handler: Handler) => {
    handlers.set(name, handler);
    return Promise.resolve(() => handlers.delete(name));
  }) as never);
  return handlers;
}

function emit(handlers: Map<string, Handler>, name: string, payload: unknown) {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`no handler registered for ${name}`);
  act(() => handler({ payload }));
}

describe("describeActivity", () => {
  it("labels known events and keeps the useful detail", () => {
    expect(describeActivity("note_saved", { title: "Vex", path: "Characters/Vex.md" })).toEqual({
      label: "Note saved",
      detail: "Vex · Characters/Vex.md",
    });
    expect(describeActivity("dice_roll", { expression: "2d6+1", total: 9 })).toEqual({
      label: "Dice roll",
      detail: "2d6+1 = 9",
    });
  });

  it("falls back to the raw event name rather than inventing a label", () => {
    expect(describeActivity("plugin_installed", {})).toEqual({
      label: "plugin_installed",
      detail: "",
    });
  });

  it("survives a missing payload", () => {
    expect(describeActivity("note_saved", null)).toEqual({ label: "Note saved", detail: "" });
  });
});

describe("useActivityLog", () => {
  let handlers: Map<string, Handler>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = captureHandlers();
  });

  it("logs a bus event exactly once", async () => {
    const { result } = renderHook(() => useActivityLog());
    await waitFor(() => expect(handlers.has("loreweaver://activity")).toBe(true));

    emit(handlers, "loreweaver://activity", {
      event: "note_saved",
      at: 1_700_000_000_000,
      payload: { title: "Oslo", path: "Worldbuilding/Oslo.md" },
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      event: "note_saved",
      label: "Note saved",
      detail: "Oslo · Worldbuilding/Oslo.md",
      count: 1,
    });
    expect(result.current.unread).toBe(1);
  });

  it("ignores an envelope with no event name", async () => {
    const { result } = renderHook(() => useActivityLog());
    await waitFor(() => expect(handlers.has("loreweaver://activity")).toBe(true));

    emit(handlers, "loreweaver://activity", { at: 1 });
    expect(result.current.entries).toHaveLength(0);
  });

  it("coalesces a burst of vault syncs into one row with a count", async () => {
    const { result } = renderHook(() => useActivityLog({ coalesceMs: 5000 }));
    await waitFor(() => expect(handlers.has("vault-changed")).toBe(true));

    // The watcher fires several times for one save; the panel shows one row.
    for (let i = 0; i < 4; i += 1) {
      emit(handlers, "vault-changed", {});
    }

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].count).toBe(4);
    expect(result.current.entries[0].label).toBe("Vault synced");
  });

  it("keeps a different event as its own row", async () => {
    const { result } = renderHook(() => useActivityLog());
    await waitFor(() => expect(handlers.has("vault-changed")).toBe(true));

    emit(handlers, "vault-changed", {});
    emit(handlers, "loreweaver://activity", {
      event: "dice_roll",
      at: Date.now(),
      payload: { expression: "1d20", total: 14 },
    });

    expect(result.current.entries.map((e) => e.event)).toEqual(["dice_roll", "vault-changed"]);
  });

  it("stays bounded at the configured limit", async () => {
    const { result } = renderHook(() => useActivityLog({ limit: 3 }));
    await waitFor(() => expect(handlers.has("loreweaver://activity")).toBe(true));

    for (let i = 0; i < 10; i += 1) {
      emit(handlers, "loreweaver://activity", {
        event: "note_saved",
        at: 1_700_000_000_000 + i * 10_000,
        payload: { title: `Note ${i}` },
      });
    }

    expect(result.current.entries).toHaveLength(3);
    // Newest first.
    expect(result.current.entries[0].detail).toBe("Note 9");
  });

  it("counts unread until the panel is opened, then resets", async () => {
    const { result } = renderHook(() => useActivityLog());
    await waitFor(() => expect(handlers.has("vault-changed")).toBe(true));

    emit(handlers, "loreweaver://activity", { event: "note_saved", at: 1, payload: {} });
    emit(handlers, "loreweaver://activity", { event: "dice_roll", at: 2, payload: {} });
    expect(result.current.unread).toBe(2);

    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(result.current.unread).toBe(0);
  });

  it("clears the log", async () => {
    const { result } = renderHook(() => useActivityLog());
    await waitFor(() => expect(handlers.has("vault-changed")).toBe(true));

    emit(handlers, "vault-changed", {});
    expect(result.current.entries).toHaveLength(1);

    act(() => result.current.clear());
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.unread).toBe(0);
  });

  it("unsubscribes on unmount", async () => {
    const offs = { count: 0 };
    vi.mocked(listen).mockImplementation(((name: string, handler: Handler) => {
      handlers.set(name, handler);
      return Promise.resolve(() => {
        offs.count += 1;
      });
    }) as never);

    const { unmount } = renderHook(() => useActivityLog());
    await waitFor(() => expect(handlers.has("vault-changed")).toBe(true));
    unmount();
    await waitFor(() => expect(offs.count).toBe(2));
  });
});
