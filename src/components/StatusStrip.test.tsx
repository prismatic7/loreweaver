import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatusStrip } from "./StatusStrip";

describe("StatusStrip", () => {
  it("shows the offline badge when unreachable", () => {
    render(
      <StatusStrip
        provider="ollama"
        model="llama3:8b"
        status={{ reachable: false, modelAvailable: false, checking: false }}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByText(/ollama/)).toBeInTheDocument();
    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("shows 'no models' when reachable but empty", () => {
    render(
      <StatusStrip
        provider="openai"
        model=""
        status={{ reachable: true, modelAvailable: false, checking: false }}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("no models")).toBeInTheDocument();
    expect(screen.queryByText("offline")).not.toBeInTheDocument();
  });

  it("says search is keyword only when the embedding model is not loaded", () => {
    render(
      <StatusStrip
        provider="ollama"
        model="bonsai-2:9b"
        status={{ reachable: true, modelAvailable: true, checking: false }}
        embeddingReady={false}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("Search: keyword only")).toBeInTheDocument();
  });

  it("shows no search caveat when embeddings are ready", () => {
    render(
      <StatusStrip
        provider="ollama"
        model="bonsai-2:9b"
        status={{ reachable: true, modelAvailable: true, checking: false }}
        embeddingReady
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.queryByText("Search: keyword only")).not.toBeInTheDocument();
  });

  it("opens settings when clicked", () => {
    const onOpenSettings = vi.fn();
    render(
      <StatusStrip
        provider="ollama"
        model=""
        status={{ reachable: true, modelAvailable: true, checking: false }}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
