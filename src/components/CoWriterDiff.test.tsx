import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CoWriterDiff } from "./CoWriterDiff";

describe("CoWriterDiff", () => {
  it("renders the removed and added lines", () => {
    render(
      <CoWriterDiff
        open
        leftText={"a\nb"}
        rightText={"a\nB"}
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/− b/)).toBeInTheDocument();
    expect(screen.getByText(/\+ B/)).toBeInTheDocument();
  });

  it("applies the revision when all hunks are accepted", () => {
    const onAccept = vi.fn();
    render(
      <CoWriterDiff
        open
        leftText={"a\nb"}
        rightText={"a\nB"}
        onAccept={onAccept}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onAccept).toHaveBeenCalledWith("a\nB");
  });

  it("keeps the original when a hunk is rejected", () => {
    const onAccept = vi.fn();
    render(
      <CoWriterDiff
        open
        leftText={"a\nb"}
        rightText={"a\nB"}
        onAccept={onAccept}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Accept hunk 1"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onAccept).toHaveBeenCalledWith("a\nb");
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <CoWriterDiff
        open={false}
        leftText="a"
        rightText="b"
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
