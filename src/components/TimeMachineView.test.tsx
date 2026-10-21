import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TimeMachineView } from "./TimeMachineView";
import { formatBytes, formatDate } from "../utils/snapshots";
import type { SnapshotInfo } from "../bindings";

const SNAPSHOTS: SnapshotInfo[] = [
  {
    id: "20261021T120000",
    label: "Before session 4",
    created_at: 1_790_000_000,
    size_bytes: 40_960,
    file_count: 12,
    vault: "eldoria",
  },
  {
    id: "20261021T130000",
    label: "",
    created_at: 1_790_003_600,
    size_bytes: 3_500_000,
    file_count: 14,
    vault: "eldoria",
  },
];

describe("TimeMachineView", () => {
  it("explains the empty state", () => {
    render(<TimeMachineView snapshots={[]} onCreate={vi.fn()} onSelect={vi.fn()} onRestore={vi.fn()} />);
    expect(screen.getByText("Time Machine")).toBeInTheDocument();
    expect(screen.getByText(/No snapshots yet/)).toBeInTheDocument();
  });

  it("lists snapshots with size and file count, falling back to the date as label", () => {
    render(
      <TimeMachineView
        snapshots={SNAPSHOTS}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText("Before session 4")).toBeInTheDocument();
    expect(screen.getByText(/12 files/)).toBeInTheDocument();
    // Unlabelled snapshots show their date instead of an empty row.
    expect(screen.getByText("14 files", { exact: false })).toBeInTheDocument();
  });

  it("takes a snapshot with the typed label and clears the input", () => {
    const onCreate = vi.fn();
    render(
      <TimeMachineView snapshots={[]} onCreate={onCreate} onSelect={vi.fn()} onRestore={vi.fn()} />,
    );
    const input = screen.getByLabelText("Snapshot label");
    fireEvent.change(input, { target: { value: "Pre-heist" } });
    fireEvent.click(screen.getByText("Snapshot now"));

    expect(onCreate).toHaveBeenCalledWith("Pre-heist");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("takes an unlabelled snapshot when the field is blank", () => {
    const onCreate = vi.fn();
    render(
      <TimeMachineView snapshots={[]} onCreate={onCreate} onSelect={vi.fn()} onRestore={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Snapshot now"));
    expect(onCreate).toHaveBeenCalledWith(undefined);
  });

  it("selects a snapshot by clicking it", () => {
    const onSelect = vi.fn();
    render(
      <TimeMachineView
        snapshots={SNAPSHOTS}
        onCreate={vi.fn()}
        onSelect={onSelect}
        onRestore={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Before session 4"));
    expect(onSelect).toHaveBeenCalledWith("20261021T120000");
  });

  it("prompts for a selection before showing a diff", () => {
    render(
      <TimeMachineView
        snapshots={SNAPSHOTS}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/compare it with the vault as it is now/)).toBeInTheDocument();
  });

  it("counts the diff and offers restore only for modified and removed files", () => {
    const onRestore = vi.fn();
    render(
      <TimeMachineView
        snapshots={SNAPSHOTS}
        selectedId="20261021T120000"
        changes={[
          { path: "Worldbuilding/Oslo.md", kind: "modified" },
          { path: "Characters/Vex.md", kind: "removed" },
          { path: "Characters/New.md", kind: "added" },
        ]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRestore={onRestore}
      />,
    );

    expect(screen.getByText("1 added").textContent).toContain("1");
    expect(screen.getByText("1 modified")).toBeInTheDocument();
    expect(screen.getByText("1 removed")).toBeInTheDocument();

    // Added files have nothing to restore — the live copy is the newer one.
    const buttons = screen.getAllByText("Restore");
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    expect(onRestore).toHaveBeenCalledWith("20261021T120000", "Worldbuilding/Oslo.md");
  });

  it("says when the vault matches the snapshot exactly", () => {
    render(
      <TimeMachineView
        snapshots={SNAPSHOTS}
        selectedId="20261021T120000"
        changes={[]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/matches this snapshot exactly/)).toBeInTheDocument();
  });

  it("surfaces a backend error", () => {
    render(
      <TimeMachineView
        snapshots={[]}
        error="Snapshot not found: 20261021T120000"
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/Snapshot not found/)).toBeInTheDocument();
  });
});

describe("Time Machine formatters", () => {
  it("formats byte counts", () => {
    expect(formatBytes(0)).toBe("0 kB");
    expect(formatBytes(40_960)).toBe("40 kB");
    expect(formatBytes(3_500_000)).toBe("3.3 MB");
  });

  it("formats a missing timestamp honestly", () => {
    expect(formatDate(0)).toBe("unknown time");
  });
});
