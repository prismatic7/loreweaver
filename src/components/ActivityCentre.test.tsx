import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ActivityCentre } from "./ActivityCentre";
import type { ActivityEntry } from "../hooks/useActivityLog";

const ENTRIES: ActivityEntry[] = [
  {
    key: 2,
    event: "note_saved",
    label: "Note saved",
    detail: "Oslo · Worldbuilding/Oslo.md",
    at: 1_700_000_060_000,
    count: 1,
  },
  {
    key: 1,
    event: "vault-changed",
    label: "Vault synced",
    detail: "",
    at: 1_700_000_000_000,
    count: 4,
  },
];

const noop = { onToggle: vi.fn(), onClose: vi.fn(), onClear: vi.fn() };

describe("ActivityCentre", () => {
  it("shows no badge when nothing is unread", () => {
    render(<ActivityCentre entries={[]} unread={0} open={false} {...noop} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("badges the unread count", () => {
    render(<ActivityCentre entries={ENTRIES} unread={3} open={false} {...noop} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("Activity (3 new)")).toBeInTheDocument();
  });

  it("caps the badge at 99+", () => {
    render(<ActivityCentre entries={ENTRIES} unread={250} open={false} {...noop} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders nothing but the badge while closed — no blocking panel", () => {
    render(<ActivityCentre entries={ENTRIES} unread={1} open={false} {...noop} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists entries newest first with a coalesced count", () => {
    render(<ActivityCentre entries={ENTRIES} unread={0} open {...noop} />);
    const rows = screen.getAllByText(/Note saved|Vault synced/);
    expect(rows[0]).toHaveTextContent("Note saved");
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getByText("Oslo · Worldbuilding/Oslo.md")).toBeInTheDocument();
  });

  it("says so when the log is empty", () => {
    render(<ActivityCentre entries={[]} unread={0} open {...noop} />);
    expect(screen.getByText("Nothing yet this session.")).toBeInTheDocument();
  });

  it("toggles, closes and clears", () => {
    const onToggle = vi.fn();
    const onClose = vi.fn();
    const onClear = vi.fn();
    render(
      <ActivityCentre
        entries={ENTRIES}
        unread={0}
        open
        onToggle={onToggle}
        onClose={onClose}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByLabelText("Activity"));
    expect(onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Close activity"));
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalled();
  });

  it("disables Clear when there is nothing to clear", () => {
    render(<ActivityCentre entries={[]} unread={0} open {...noop} />);
    expect(screen.getByText("Clear").closest("button")).toBeDisabled();
  });
});
