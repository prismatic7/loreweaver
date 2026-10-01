import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionTools } from "./useSessionTools";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useSessionTools - TTS Voice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes configured ttsVoice to generate_speech invoke", async () => {
    vi.mocked(invoke).mockResolvedValue("data:audio/wav;base64,AAAA");

    const { result } = renderHook(() =>
      useSessionTools({
        pluginsList: [],
        alert: vi.fn(),
        imageProvider: "local",
        imageModel: "",
        imageApiKey: "",
        imageBaseUrl: "",
        ttsProvider: "openai",
        ttsApiKey: "test-key",
        ttsBaseUrl: "",
        ttsVoice: "nova",
        sttProvider: "local",
        sttApiKey: "",
        sttBaseUrl: "",
      })
    );

    act(() => {
      result.current.setTtsText("Hello adventurer");
    });

    await act(async () => {
      result.current.handleGenerateSpeech();
    });

    expect(invoke).toHaveBeenCalledWith("generate_speech", {
      text: "Hello adventurer",
      provider: "openai",
      apiKey: "test-key",
      voice: "nova",
      baseUrl: null,
    });
  });

  it("falls back to alloy when ttsVoice is default for openai", async () => {
    vi.mocked(invoke).mockResolvedValue("data:audio/wav;base64,AAAA");

    const { result } = renderHook(() =>
      useSessionTools({
        pluginsList: [],
        alert: vi.fn(),
        imageProvider: "local",
        imageModel: "",
        imageApiKey: "",
        imageBaseUrl: "",
        ttsProvider: "openai",
        ttsApiKey: "test-key",
        ttsBaseUrl: "",
        ttsVoice: "default",
        sttProvider: "local",
        sttApiKey: "",
        sttBaseUrl: "",
      })
    );

    act(() => {
      result.current.setTtsText("Hello adventurer");
    });

    await act(async () => {
      result.current.handleGenerateSpeech();
    });

    expect(invoke).toHaveBeenCalledWith("generate_speech", {
      text: "Hello adventurer",
      provider: "openai",
      apiKey: "test-key",
      voice: "alloy",
      baseUrl: null,
    });
  });

  it("passes custom voice for local provider and null when default", async () => {
    vi.mocked(invoke).mockResolvedValue("data:audio/wav;base64,AAAA");

    const { result } = renderHook(() =>
      useSessionTools({
        pluginsList: [],
        alert: vi.fn(),
        imageProvider: "local",
        imageModel: "",
        imageApiKey: "",
        imageBaseUrl: "",
        ttsProvider: "local",
        ttsApiKey: "",
        ttsBaseUrl: "",
        ttsVoice: "Samantha",
        sttProvider: "local",
        sttApiKey: "",
        sttBaseUrl: "",
      })
    );

    act(() => {
      result.current.setTtsText("Hello local");
    });

    await act(async () => {
      result.current.handleGenerateSpeech();
    });

    expect(invoke).toHaveBeenCalledWith("generate_speech", {
      text: "Hello local",
      provider: "local",
      apiKey: null,
      voice: "Samantha",
      baseUrl: null,
    });
  });

  it("tracks speech error state and avoids alert popups on failure", async () => {
    const alertMock = vi.fn();
    vi.mocked(invoke).mockRejectedValue(new Error("Local TTS failed"));

    const { result } = renderHook(() =>
      useSessionTools({
        pluginsList: [],
        alert: alertMock,
        imageProvider: "local",
        imageModel: "",
        imageApiKey: "",
        imageBaseUrl: "",
        ttsProvider: "local",
        ttsApiKey: "",
        ttsBaseUrl: "",
        ttsVoice: "default",
        sttProvider: "local",
        sttApiKey: "",
        sttBaseUrl: "",
      })
    );

    act(() => {
      result.current.setTtsText("Will fail");
    });

    await act(async () => {
      result.current.handleGenerateSpeech();
    });

    expect(result.current.isGeneratingSpeech).toBe(false);
    expect(result.current.speechError).toContain("Local TTS failed");
    expect(alertMock).not.toHaveBeenCalled();
  });
});
