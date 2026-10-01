import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InlineDiceBadge } from "./InlineDiceBadge";

describe("InlineDiceBadge Component", () => {
  it("renders formula and dice icon", () => {
    render(<InlineDiceBadge formula="2d6+3" />);
    expect(screen.getByText("2d6+3")).toBeInTheDocument();
  });

  it("rolls dice on click and displays total", async () => {
    vi.useFakeTimers();
    const onRoll = vi.fn();
    render(<InlineDiceBadge formula="2d6+3" onRoll={onRoll} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onRoll).toHaveBeenCalled();
    const outcome = onRoll.mock.calls[0][0];
    expect(outcome.notation).toBe("2d6+3");
    expect(outcome.total).toBeGreaterThanOrEqual(5);
    expect(outcome.total).toBeLessThanOrEqual(15);

    expect(screen.getByText(String(outcome.total))).toBeInTheDocument();
    vi.useRealTimers();
  });
});
