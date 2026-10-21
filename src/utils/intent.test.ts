import { describe, it, expect } from "vitest";
import { parseIntent, describeIntent } from "./intent";

describe("parseIntent", () => {
  it("routes dice expressions to roll", () => {
    expect(parseIntent("1d20+4")).toEqual({ kind: "roll", expression: "1d20+4" });
    expect(parseIntent("d6")).toEqual({ kind: "roll", expression: "d6" });
    expect(parseIntent("roll 2d6+1")).toEqual({ kind: "roll", expression: "2d6+1" });
  });

  it("routes @capture to capture", () => {
    expect(parseIntent("@capture the goblin king")).toEqual({
      kind: "capture",
      text: "the goblin king",
    });
  });

  it("routes /find and bare text to find", () => {
    expect(parseIntent("/find grapple")).toEqual({ kind: "find", query: "grapple" });
    expect(parseIntent("grapple")).toEqual({ kind: "find", query: "grapple" });
  });

  it("routes go <view> to go", () => {
    expect(parseIntent("go map")).toEqual({ kind: "go", view: "map" });
  });

  it("routes ask and trailing '?' to ask", () => {
    expect(parseIntent("ask who rules the north")).toEqual({
      kind: "ask",
      query: "who rules the north",
    });
    expect(parseIntent("where is the temple?")).toEqual({
      kind: "ask",
      query: "where is the temple?",
    });
  });
});

describe("describeIntent", () => {
  it("labels each intent", () => {
    expect(describeIntent({ kind: "roll", expression: "1d20+4" })).toBe("Roll 1d20+4");
    expect(describeIntent({ kind: "find", query: "grapple" })).toBe('Search "grapple"');
    expect(describeIntent({ kind: "go", view: "map" })).toBe("Go to map");
  });
});
