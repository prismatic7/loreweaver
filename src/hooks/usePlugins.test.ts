import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePlugins } from "./usePlugins";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("usePlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads plugins list on mount and vault change", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "load_plugins") {
        return [
          { id: "unslop", name: "Campaign Prose Humaniser (Unslop)", active: true },
        ];
      }
      return null;
    });

    const { result } = renderHook(() => usePlugins("/path/to/vault"));

    await waitFor(() => {
      expect(result.current.pluginsList).toEqual([
        { id: "unslop", name: "Campaign Prose Humaniser (Unslop)", active: true },
      ]);
    });

    expect(invoke).toHaveBeenCalledWith("load_plugins");
  });

  it("executes plugin hook via invoke", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "load_plugins") return [];
      if (cmd === "execute_plugin_hook") {
        return JSON.stringify({ cleaned_text: "Cleaned note", replacements_count: 2 });
      }
      return null;
    });

    const { result } = renderHook(() => usePlugins("/path/to/vault"));

    let res = "";
    await act(async () => {
      res = await result.current.executeHook("unslop", "humanize_prose", "text");
    });

    expect(invoke).toHaveBeenCalledWith("execute_plugin_hook", {
      pluginId: "unslop",
      hook: "humanize_prose",
      payload: "text",
    });
    expect(JSON.parse(res)).toEqual({
      cleaned_text: "Cleaned note",
      replacements_count: 2,
    });
  });

  it("handleHumanizeNote calls clean_note and triggers onCleaned callback", async () => {
    const mockCleanResult = {
      title: "Test Encounter",
      content: "The heroes explored the ruins.",
      summary: "Humanised note: stripped 2 AI-isms (vocab-delve (1), authority-fundamentally (1)).",
      replacements_count: 2,
    };

    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "load_plugins") return [];
      if (cmd === "execute_plugin_hook") {
        if (args?.hook === "clean_note") {
          return JSON.stringify(mockCleanResult);
        }
      }
      return null;
    });

    const { result } = renderHook(() => usePlugins("/path/to/vault"));

    const onCleaned = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      await result.current.handleHumanizeNote(
        "Fundamentally, the heroes delve into the ruins.",
        "Test Encounter",
        onCleaned,
        onError
      );
    });

    expect(invoke).toHaveBeenCalledWith("execute_plugin_hook", {
      pluginId: "unslop",
      hook: "clean_note",
      payload: JSON.stringify({
        title: "Test Encounter",
        content: "Fundamentally, the heroes delve into the ruins.",
      }),
    });

    expect(onCleaned).toHaveBeenCalledWith(
      "The heroes explored the ruins.",
      "Humanised note: stripped 2 AI-isms (vocab-delve (1), authority-fundamentally (1))."
    );
    expect(onError).not.toHaveBeenCalled();
  });
});
