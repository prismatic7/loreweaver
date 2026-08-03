import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SettingsView } from "./SettingsView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

describe("SettingsView Component", () => {
  it("renders settings view header and active campaign directory", () => {
    const registerMock = vi.fn().mockReturnValue({});
    const handleSubmitMock = vi.fn((fn) => async (e: any) => {
      e?.preventDefault?.();
      await fn({});
    }) as any;
    const onSubmitMock = vi.fn();
    const watchMock = vi.fn((field) => {
      if (field === "llm_provider") return "ollama";
      return "";
    });
    const setValueMock = vi.fn();

    render(
      <SettingsView
        register={registerMock}
        handleSubmit={handleSubmitMock}
        onSubmit={onSubmitMock}
        errors={{}}
        isDirty={true}
        isValid={true}
        watch={watchMock}
        setValue={setValueMock}
        vaultPath="/test/vault/path"
        pluginsList={[{ id: "p1", name: "Plugin 1", active: true }]}
      />,
    );

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Save Configuration")).toBeInTheDocument();
    expect(screen.getByText("Active Campaign Directory")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/test/vault/path")).toBeInTheDocument();
    expect(screen.getByText("Plugin 1")).toBeInTheDocument();
  });
});
