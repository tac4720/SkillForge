import { describe, expect, it } from "vitest";

import { evaluateAssertions } from "../../src/replay/assertion-evaluator.js";

describe("assertion-evaluator", () => {
  it("ASSERT-001 passes urlMatches", () => {
    const result = evaluateAssertions([{ type: "urlMatches", value: "^https://portal\\.vendor\\.example" }], {
      currentUrl: "https://portal.vendor.example/invoices"
    });

    expect(result.pass).toBe(true);
  });

  it("ASSERT-002 passes textContains", () => {
    const result = evaluateAssertions(
      [{ type: "textContains", locator: "h1", value: "Invoices" }],
      {
        textByLocator: { h1: "Invoices for March" }
      }
    );

    expect(result.pass).toBe(true);
  });

  it("ASSERT-003 passes fileExists", () => {
    const result = evaluateAssertions([{ type: "fileExists", path: "/tmp/invoice.pdf" }], {
      existingFiles: new Set(["/tmp/invoice.pdf"])
    });

    expect(result.pass).toBe(true);
  });

  it("ASSERT-004 passes exitCode", () => {
    const result = evaluateAssertions([{ type: "exitCode", value: 0 }], {
      exitCode: 0
    });

    expect(result.pass).toBe(true);
  });

  it("ASSERT-005 passes stdoutRegex", () => {
    const result = evaluateAssertions([{ type: "stdoutRegex", value: "forbidden: 0" }], {
      stdout: "report\nforbidden: 0\n"
    });

    expect(result.pass).toBe(true);
  });

  it("ASSERT-006 returns a reason on assertion failure", () => {
    const result = evaluateAssertions([{ type: "urlMatches", value: "^https://safe\\.example" }], {
      currentUrl: "https://portal.vendor.example/invoices"
    });

    expect(result.pass).toBe(false);
    expect(result.failures[0]?.reason).toContain("URL did not match");
  });

  it("ASSERT-007 evaluates multiple assertions with AND semantics", () => {
    const result = evaluateAssertions(
      [
        { type: "urlMatches", value: "^https://portal\\.vendor\\.example" },
        { type: "textContains", locator: "h1", value: "Invoices" }
      ],
      {
        currentUrl: "https://portal.vendor.example/invoices",
        textByLocator: { h1: "Invoices" }
      }
    );

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("ASSERT-008 reports textContains failures", () => {
    const result = evaluateAssertions(
      [{ type: "textContains", locator: "h1", value: "Invoices" }],
      {
        textByLocator: { h1: "Dashboard" }
      }
    );

    expect(result.pass).toBe(false);
    expect(result.failures[0]?.reason).toContain("did not contain");
  });

  it("ASSERT-009 reports fileExists, exitCode, and stdoutRegex failures", () => {
    const result = evaluateAssertions(
      [
        { type: "fileExists", path: "/tmp/report.txt" },
        { type: "exitCode", value: 0 },
        { type: "stdoutRegex", value: "forbidden: 0" }
      ],
      {
        existingFiles: new Set(),
        exitCode: 2,
        stdout: "forbidden: 1"
      }
    );

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(3);
  });

  it("ASSERT-010 falls back to empty context values when optional fields are absent", () => {
    const result = evaluateAssertions(
      [
        { type: "urlMatches", value: "^https://safe\\.example" },
        { type: "textContains", locator: "h1", value: "Invoices" },
        { type: "exitCode", value: 0 },
        { type: "stdoutRegex", value: "ok" }
      ],
      {}
    );

    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(4);
  });
});
