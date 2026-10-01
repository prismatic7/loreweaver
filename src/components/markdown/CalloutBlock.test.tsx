import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalloutBlock } from "./CalloutBlock";

describe("CalloutBlock", () => {
  it("renders non-foldable callout", () => {
    render(
      <CalloutBlock calloutType="note" title="Note Title" isFoldable={false} defaultFolded={false}>
        <p>Callout content</p>
      </CalloutBlock>
    );
    expect(screen.getByText("Note Title")).toBeInTheDocument();
    expect(screen.getByText("Callout content")).toBeInTheDocument();
  });

  it("toggles foldable callout on header click", () => {
    render(
      <CalloutBlock calloutType="tip" title="Foldable Tip" isFoldable={true} defaultFolded={true}>
        <p>Hidden body</p>
      </CalloutBlock>
    );
    const header = screen.getByText("Foldable Tip");
    expect(screen.queryByText("Hidden body")).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.getByText("Hidden body")).toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.queryByText("Hidden body")).not.toBeInTheDocument();
  });
});
