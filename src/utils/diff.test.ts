import { describe, it, expect } from "vitest";
import { diffLines, applyHunks } from "./diff";

describe("diffLines", () => {
  it("returns no hunks for identical text", () => {
    const result = diffLines("a\nb\nc", "a\nb\nc");
    expect(result.hunks).toHaveLength(0);
  });

  it("detects a changed line as one hunk", () => {
    const { hunks } = diffLines("a\nb\nc", "a\nB\nc");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].leftStart).toBe(1);
    expect(hunks[0].leftLines).toEqual(["b"]);
    expect(hunks[0].rightLines).toEqual(["B"]);
  });

  it("detects an insertion with empty leftLines", () => {
    const { hunks } = diffLines("a\nc", "a\nb\nc");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].leftLines).toEqual([]);
    expect(hunks[0].rightLines).toEqual(["b"]);
  });

  it("detects a deletion with empty rightLines", () => {
    const { hunks } = diffLines("a\nb\nc", "a\nc");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].leftLines).toEqual(["b"]);
    expect(hunks[0].rightLines).toEqual([]);
  });
});

describe("applyHunks", () => {
  const left = "a\nb\nc";
  const right = "a\nB\nc";
  const { hunks } = diffLines(left, right);

  it("returns the revised text when all hunks are accepted", () => {
    expect(applyHunks(left, hunks, new Set([0]))).toBe(right);
  });

  it("returns the original text when no hunks are accepted", () => {
    expect(applyHunks(left, hunks, new Set())).toBe(left);
  });

  it("applies only the accepted hunks", () => {
    const original = "line1\nline2\nline3\nline4";
    const revised = "line1\nCHANGED\nline3\nALSO CHANGED";
    const d = diffLines(original, revised);
    expect(d.hunks).toHaveLength(2);

    // Accept only the first hunk → second line changed, fourth untouched.
    const result = applyHunks(original, d.hunks, new Set([0]));
    expect(result).toBe("line1\nCHANGED\nline3\nline4");
  });
});
