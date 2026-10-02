import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SettingsView } from "./SettingsView";

const invokeMock = vi.fn<(...args: unknown[]) => Promise<unknown>>(
  async () => [],
);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

const baseProps = {
  register: vi.fn().mockReturnValue({}),
  handleSubmit: vi.fn((fn) => async (e: any) => {
    e?.preventDefault?.();
    await fn({});
  }) as any,
  onSubmit: vi.fn(),
  watch: vi.fn((field) => {
    if (field === "llm_provider") return "ollama";
    return "";
  }),
  setValue: vi.fn(),
  errors: {},
  isDirty: true,
  isValid: true,
  vaultPath: "/test/vault/path",
  pluginsList: [{ id: "p1", name: "Plugin 1", active: true }],
};

describe("SettingsView Component", () => {
  it("renders settings view header and active campaign directory", () => {
    render(<SettingsView {...baseProps} />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Save Configuration")).toBeInTheDocument();
    expect(screen.getByText("Active Campaign Directory")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/test/vault/path")).toBeInTheDocument();
    expect(screen.getByText("Plugin 1")).toBeInTheDocument();
  });

  it("renders bible files from the vault folder dynamically", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "list_bible_files") {
        return ["TONE.md", "RULES.md", "HOUSE_RULES.md"];
      }
      if (cmd === "get_world_manifest") {
        return { bible_files: ["TONE.md"] };
      }
      return [];
    });

    render(<SettingsView {...baseProps} />);

    // Custom file added to bible/ on disk shows up in the pane.
    expect(await screen.findByText("HOUSE_RULES")).toBeInTheDocument();
    expect(screen.getByText("TONE")).toBeInTheDocument();
    expect(screen.getByText("RULES")).toBeInTheDocument();
  });

  it("shows an empty state when the bible folder has no notes", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "list_bible_files") return [];
      if (cmd === "get_world_manifest") return { bible_files: [] };
      return [];
    });

    render(<SettingsView {...baseProps} />);

    expect(
      await screen.findByText(/No bible notes yet/),
    ).toBeInTheDocument();
  });

  it("handles provider connection test returning models", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "test_provider_connection") {
        return ["sd_xl_base_1.0.safetensors", "v1-5-pruned.safetensors"];
      }
      return [];
    });

    render(<SettingsView {...baseProps} />);

    const testBtn = screen.getByText("Run Connection Test");
    fireEvent.click(testBtn);

    expect(
      await screen.findByText("Connected. Pick a model below to select it:")
    ).toBeInTheDocument();
    expect(screen.getByText("sd_xl_base_1.0.safetensors")).toBeInTheDocument();
    expect(screen.getByText("v1-5-pruned.safetensors")).toBeInTheDocument();
    expect(screen.queryByText(/Connection Failed:/)).not.toBeInTheDocument();
  });

  it("handles provider connection test returning 0 models without failing connection", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "test_provider_connection") {
        return [];
      }
      return [];
    });

    render(<SettingsView {...baseProps} />);

    const testBtn = screen.getByText("Run Connection Test");
    fireEvent.click(testBtn);

    expect(
      await screen.findByText("Connected, but no models were returned by the provider.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Connection Failed:/)).not.toBeInTheDocument();
  });

  it("handles provider connection test network failure cleanly", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "test_provider_connection") {
        throw new Error("Failed to connect to ComfyUI");
      }
      return [];
    });

    render(<SettingsView {...baseProps} />);

    const testBtn = screen.getByText("Run Connection Test");
    fireEvent.click(testBtn);

    expect(
      await screen.findByText(/Connection Failed:/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Failed to connect to ComfyUI/)).toBeInTheDocument();
    expect(screen.queryByText(/Connected/)).not.toBeInTheDocument();
  });
});

