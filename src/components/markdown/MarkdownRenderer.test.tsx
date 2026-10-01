import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownRenderer } from "./MarkdownRenderer";

describe("MarkdownRenderer Integration", () => {
  it("renders GFM table and Obsidian callout together", () => {
    const md = `
> [!NOTE] Alert Box
> Important content

| Col 1 | Col 2 |
| :--- | :--- |
| Val 1 | Val 2 |
`;
    render(
      <MarkdownRenderer
        content={md}
        notes={[]}
        selectedNoteId=""
        vaultPath="/vault"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
      />
    );
    expect(screen.getByText("Alert Box")).toBeInTheDocument();
    expect(screen.getByText("Important content")).toBeInTheDocument();
    expect(screen.getByText("Val 1")).toBeInTheDocument();
  });

  it("renders ==highlights== and #tags", () => {
    const md = "This is ==critical lore== for #campaign.";
    render(
      <MarkdownRenderer
        content={md}
        notes={[]}
        selectedNoteId=""
        vaultPath="/vault"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
      />
    );
    expect(screen.getByText("critical lore")).toBeInTheDocument();
    expect(screen.getByText("#campaign")).toBeInTheDocument();
  });

  it("handles interactive task checkbox toggles", () => {
    const onToggleTask = vi.fn();
    const md = "- [ ] Unfinished task\n- [x] Finished task";
    render(
      <MarkdownRenderer
        content={md}
        notes={[]}
        selectedNoteId=""
        vaultPath="/vault"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
        onToggleTask={onToggleTask}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);

    fireEvent.click(checkboxes[0]);
    expect(onToggleTask).toHaveBeenCalledWith(0, true);
  });

  it("renders inline dice formulas with interactive dice badges", () => {
    const md = "Roll for initiative: 1d20+5, or take 2d6 damage!";
    render(
      <MarkdownRenderer
        content={md}
        notes={[]}
        selectedNoteId=""
        vaultPath="/vault"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
      />
    );
    expect(screen.getByText("1d20+5")).toBeInTheDocument();
    expect(screen.getByText("2d6")).toBeInTheDocument();
  });
});
