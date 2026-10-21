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
