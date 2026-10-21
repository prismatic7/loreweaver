import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSavedSearches } from "./useSavedSearches";
import { invoke } from "@tauri-apps/api/core";
import type { CampaignNote } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const NOTES: CampaignNote[] = [
  {
    id: "n1",
    title: "Vex",
    path: "Characters/Vex.md",
    frontmatter: { type: "npc", faction: "Watch" },
    content: "captain",
  },
  {
    id: "n2",
    title: "Kade",
    path: "Characters/Kade.md",
    frontmatter: { type: "npc" },
    content: "nobody knows",
  },
  {
    id: "n3",
    title: "Harbour Watch",
    path: "Factions/Watch.md",
    frontmatter: { type: "faction" },
    content: "docks",
  },
];

const FILTER_SEARCH = {
  id: "s1",
  name: "Deposed NPCs",
  kind: "filter",
  query: "type:npc !faction",
  filters: "",
  created_at: 1,
};

describe("useSavedSearches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists saved searches for the vault", async () => {
    vi.mocked(invoke).mockResolvedValue([FILTER_SEARCH]);
    const { result } = renderHook(() => useSavedSearches(NOTES, "/vault"));

    await waitFor(() => expect(result.current.searches).toHaveLength(1));
    expect(invoke).toHaveBeenCalledWith("list_saved_searches");
    expect(result.current.active).toBeNull();
  });

  it("filters notes locally for a filter-kind search without IPC", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_saved_searches") return [FILTER_SEARCH];
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSavedSearches(NOTES, "/vault"));
    await waitFor(() => expect(result.current.searches).toHaveLength(1));

    await act(async () => {
      await result.current.run("s1");
    });

    expect(result.current.active?.id).toBe("s1");
    expect(result.current.results?.map((n) => n.id)).toEqual(["n2"]);
    // Only the listing call — filtering never crosses the IPC boundary.
    expect(vi.mocked(invoke).mock.calls).toHaveLength(1);
  });

  it("maps full-text hits back to notes by path, then applies its filters", async () => {
    const ftsSearch = {
      id: "s2",
      name: "Watch mentions",
      kind: "fts",
      query: "watch",
      filters: "type:npc",
      created_at: 2,
    };
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_saved_searches") return [ftsSearch];
      if (cmd === "search_vault") {
        return {
          results: [
            { path: "Characters/Vex.md" },
            { path: "Factions/Watch.md" },
          ],
        };
      }
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSavedSearches(NOTES, "/vault"));
    await waitFor(() => expect(result.current.searches).toHaveLength(1));

    await act(async () => {
      await result.current.run("s2");
    });

    expect(invoke).toHaveBeenCalledWith("search_vault", { query: "watch", limit: 200 });
    // `type:npc` narrows out the faction note.
    expect(result.current.results?.map((n) => n.id)).toEqual(["n1"]);
  });

  it("clears the active search", async () => {
    vi.mocked(invoke).mockResolvedValue([FILTER_SEARCH]);
    const { result } = renderHook(() => useSavedSearches(NOTES, "/vault"));
    await waitFor(() => expect(result.current.searches).toHaveLength(1));

    await act(async () => {
      await result.current.run("s1");
    });
    expect(result.current.results).not.toBeNull();

    act(() => result.current.clear());
    expect(result.current.active).toBeNull();
    expect(result.current.results).toBeNull();
  });

  it("saves a new search with an empty id and zero timestamp", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_saved_searches") return [];
      if (cmd === "save_saved_search") return { ...FILTER_SEARCH, id: "generated" };
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSavedSearches(NOTES, "/vault"));
    await waitFor(() => expect(result.current.searches).toEqual([]));

    await act(async () => {
      await result.current.save({
        name: "Deposed NPCs",
        kind: "filter",
        query: "type:npc !faction",
      });
    });

    expect(invoke).toHaveBeenCalledWith("save_saved_search", {
      search: {
        id: "",
        name: "Deposed NPCs",
        kind: "filter",
        query: "type:npc !faction",
        filters: "",
        created_at: 0,
      },
    });
  });

  it("clears the active search when it is deleted", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_saved_searches") return [FILTER_SEARCH];
      if (cmd === "delete_saved_search") return true;
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSavedSearches(NOTES, "/vault"));
    await waitFor(() => expect(result.current.searches).toHaveLength(1));

    await act(async () => {
      await result.current.run("s1");
    });
    await act(async () => {
      await result.current.remove("s1");
    });

    expect(result.current.activeId).toBeNull();
  });

  it("reports a failed save instead of throwing", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_saved_searches") return [];
      if (cmd === "save_saved_search") throw "A saved search needs a name";
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSavedSearches(NOTES, "/vault"));
    await waitFor(() => expect(result.current.searches).toEqual([]));

    let saved: unknown = "unset";
    await act(async () => {
      saved = await result.current.save({ name: "x", kind: "filter", query: "y" });
    });

    expect(saved).toBeNull();
    expect(result.current.error).toContain("needs a name");
  });
});
