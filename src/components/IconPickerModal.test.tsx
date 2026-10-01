import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IconPickerModal } from "./IconPickerModal";

describe("IconPickerModal", () => {
  it("renders when open and shows icons", () => {
    render(
      <IconPickerModal
        open={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Select Note Icon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search icons...")).toBeInTheDocument();
    expect(screen.getByLabelText("Swords")).toBeInTheDocument();
  });

  it("filters icons using the search input", () => {
    render(
      <IconPickerModal
        open={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search icons...");
    fireEvent.change(searchInput, { target: { value: "Skull" } });

    expect(screen.getByLabelText("Skull")).toBeInTheDocument();
    expect(screen.queryByLabelText("Compass")).not.toBeInTheDocument();
  });

  it("calls onSelect when an icon is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <IconPickerModal
        open={true}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Crown"));
    expect(onSelect).toHaveBeenCalledWith("Crown");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSelect(null) when Clear Icon is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <IconPickerModal
        open={true}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByText("Clear Icon"));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <IconPickerModal
        open={true}
        onClose={onClose}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
