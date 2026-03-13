import { describe, expect, it } from "vitest";

import { classifyRisk } from "../../src/security/risk-classifier.js";

describe("risk-classifier", () => {
  it("RISK-001 classifies read-only actions as low", () => {
    expect(classifyRisk({ type: "browser.extract" })).toBe("low");
  });

  it("RISK-002 classifies form input as medium", () => {
    expect(classifyRisk({ type: "browser.input" })).toBe("medium");
  });

  it("RISK-003 classifies send delete update payment as high", () => {
    expect(classifyRisk({ type: "browser.click", action: "send" })).toBe("high");
    expect(classifyRisk({ type: "browser.click", action: "delete" })).toBe("high");
    expect(classifyRisk({ type: "browser.click", action: "update" })).toBe("high");
    expect(classifyRisk({ type: "browser.click", action: "payment" })).toBe("high");
  });

  it("RISK-004 classifies write-like shell commands as high", () => {
    expect(classifyRisk({ type: "shell.exec", command: "touch" })).toBe("high");
  });
});
