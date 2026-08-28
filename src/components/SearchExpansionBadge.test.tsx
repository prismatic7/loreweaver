import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SearchExpansionBadge } from "./SearchExpansionBadge";

describe("SearchExpansionBadge", () => {
  it("renders nothing when the query was not expanded", () => {
    const { container } = render(<SearchExpansionBadge expanded={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the badge when the query was expanded", () => {
    render(<SearchExpansionBadge expanded={true} />);
    expect(screen.getByText("expanded")).toBeInTheDocument();
    expect(screen.getByTitle(/Query expanded/)).toBeInTheDocument();
  });
});
