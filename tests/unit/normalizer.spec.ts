import { describe, expect, it } from "vitest";

import { normalizeEvents } from "../../src/core/event-normalizer.js";

describe("normalizer", () => {
  it("NORM-001 compresses contiguous keypress events into one input", () => {
    const result = normalizeEvents([
      { type: "keypress", key: "a", targetId: "search" },
      { type: "keypress", key: "b", targetId: "search" },
      { type: "keypress", key: "c", targetId: "search" }
    ]);

    expect(result).toEqual([
      {
        type: "browser.input",
        targetId: "search",
        value: "abc",
        selectorCandidates: undefined
      }
    ]);
  });

  it("NORM-002 removes unnecessary hover events", () => {
    const result = normalizeEvents([{ type: "hover", targetId: "button" }]);
    expect(result).toEqual([]);
  });

  it("NORM-003 inserts required waits after click", () => {
    const result = normalizeEvents([
      { type: "click", targetId: "download" },
      { type: "navigate", url: "https://portal.vendor.example/invoices" }
    ]);

    expect(result).toEqual([
      {
        type: "browser.click",
        targetId: "download",
        selectorCandidates: undefined
      },
      {
        type: "browser.waitFor",
        stateChange: "navigation"
      },
      {
        type: "browser.navigate",
        url: "https://portal.vendor.example/invoices"
      }
    ]);
  });

  it("NORM-004 keeps multiple selector candidates", () => {
    const result = normalizeEvents([
      {
        type: "click",
        targetId: "download",
        selectorCandidates: ["text=Download", "role=button[name=\"Download\"]", "css=.download"]
      }
    ]);

    expect(result[0]?.selectorCandidates).toEqual([
      "role=button[name=\"Download\"]",
      "text=Download",
      "css=.download"
    ]);
  });

  it("NORM-005 prefers role or text selectors over dynamic ids", () => {
    const result = normalizeEvents([
      {
        type: "click",
        targetId: "download",
        selectorCandidates: ["css=#btn-12345", "text=Download", "role=button[name=\"Download\"]"]
      }
    ]);

    expect(result[0]?.selectorCandidates?.slice(0, 2)).toEqual([
      "role=button[name=\"Download\"]",
      "text=Download"
    ]);
  });

  it("NORM-006 compresses redundant clicks on the same element", () => {
    const result = normalizeEvents([
      { type: "click", targetId: "download" },
      { type: "click", targetId: "download" }
    ]);

    expect(result).toEqual([
      {
        type: "browser.click",
        targetId: "download",
        selectorCandidates: undefined
      }
    ]);
  });

  it("NORM-007 represents state changes without url changes", () => {
    const result = normalizeEvents([{ type: "stateChange", stateChange: "modal-opened" }]);
    expect(result).toEqual([
      {
        type: "browser.stateChange",
        stateChange: "modal-opened",
        url: undefined
      }
    ]);
  });

  it("NORM-008 does not silently drop unsupported events", () => {
    const result = normalizeEvents([{ type: "drag", targetId: "card-1" }]);
    expect(result).toEqual([
      {
        type: "unsupported",
        originalType: "drag",
        targetId: "card-1",
        selectorCandidates: undefined
      }
    ]);
  });
});
