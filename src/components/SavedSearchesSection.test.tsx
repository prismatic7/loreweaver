import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SavedSearchesSection } from "./SavedSearchesSection";
import type { SavedSearch } from "../bindings";

const SEARCHES: SavedSearch[] = [
  {
    id: "s1",
    name: "Deposed NPCs",
    kind: "filter",
    query: "type:npc !faction",
    filters: "",
    created_at: 1,
  },
  {
    id: "s2",
    name: "Grapple rules",
    kind: "fts",
    query: "grapple",
    filters: "type:rule",
    created_at: 2,
  },
];

const noop = {
  onRun: vi.fn(),
  onDelete: vi.fn(),
  onSave: vi.fn(),
  onClear: vi.fn(),
};

describe("SavedSearchesSection", () => {
  it("says so when there are no smart folders", () => {
    render(<SavedSearchesSection searches={[]} {...noop} />);
    expect(screen.getByText("No smart folders yet.")).toBeInTheDocument();
  });

  it("lists saved searches", () => {
    render(<SavedSearchesSection searches={SEARCHES} {...noop} />);
    expect(screen.getByText("Deposed NPCs")).toBeInTheDocument();
    expect(screen.getByText("Grapple rules")).toBeInTheDocument();
  });

  it("runs a search when clicked", () => {
    const onRun = vi.fn();
    render(<SavedSearchesSection searches={SEARCHES} onRun={onRun} onDelete={vi.fn()} onSave={vi.fn()} onClear={vi.fn()} />);
    fireEvent.click(screen.getByText("Deposed NPCs"));
    expect(onRun).toHaveBeenCalledWith("s1");
  });

  it("shows the match count on the active search", () => {
    render(
      <SavedSearchesSection searches={SEARCHES} activeId="s1" matchCount={4} {...noop} />,
    );
    expect(screen.getByText(/Deposed NPCs \(4\)/)).toBeInTheDocument();
  });

  it("clears the active search instead of re-running it", () => {
    const onClear = vi.fn();
    const onRun = vi.fn();
    render(
      <SavedSearchesSection
        searches={SEARCHES}
        activeId="s1"
        onRun={onRun}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText(/Deposed NPCs/));
    expect(onClear).toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
  });

  it("deletes without running", () => {
    const onDelete = vi.fn();
    const onRun = vi.fn();
    render(
      <SavedSearchesSection
        searches={SEARCHES}
        onRun={onRun}
        onDelete={onDelete}
        onSave={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Delete smart folder Grapple rules"));
    expect(onDelete).toHaveBeenCalledWith("s2");
    expect(onRun).not.toHaveBeenCalled();
  });

  it("saves a new filter search with its name, query and kind", () => {
    const onSave = vi.fn();
    render(
      <SavedSearchesSection
        searches={[]}
        onRun={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
        onClear={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Save a new smart folder"));
    fireEvent.change(screen.getByLabelText("Smart folder name"), {
      target: { value: "  Dead threads  " },
    });
    fireEvent.change(screen.getByLabelText("Smart folder query"), {
      target: { value: "type:thread status:dead" },
    });
    fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith("Dead threads", "type:thread status:dead", "filter");
  });

  it("will not save without both a name and a query", () => {
    const onSave = vi.fn();
    render(
      <SavedSearchesSection
        searches={[]}
        onRun={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Save a new smart folder"));
    fireEvent.change(screen.getByLabelText("Smart folder name"), {
      target: { value: "Only a name" },
    });
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("can save a full-text search", () => {
    const onSave = vi.fn();
    render(
      <SavedSearchesSection
        searches={[]}
        onRun={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Save a new smart folder"));
    fireEvent.change(screen.getByLabelText("Smart folder name"), { target: { value: "Rules" } });
    fireEvent.change(screen.getByLabelText("Smart folder kind"), { target: { value: "fts" } });
    fireEvent.change(screen.getByLabelText("Smart folder query"), {
      target: { value: "grapple" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith("Rules", "grapple", "fts");
  });
});
