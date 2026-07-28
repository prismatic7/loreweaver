import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MarkdownEditor from "./MarkdownEditor";

vi.mock("@uiw/react-codemirror", () => {
  return {
    default: ({ value, onChange }: any) => {
      return (
        <textarea
          data-testid="mock-codemirror"
          value={value}
          onChange={(e) => {
            if (onChange) {
              onChange(e.target.value);
            }
          }}
        />
      );
    },
  };
});

describe("MarkdownEditor Component", () => {
  it("renders with initial value and triggers onChange", () => {
    const handleChange = vi.fn();
    render(
      <MarkdownEditor
        value="Initial content"
        onChange={handleChange}
        notes={[]}
      />,
    );

    const textarea = screen.getByTestId("mock-codemirror");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("Initial content");

    fireEvent.change(textarea, { target: { value: "New edited content" } });
    expect(handleChange).toHaveBeenCalledWith("New edited content");
  });
});
