import { describe, expect, it } from "vitest";

import { evaluateBrowserUrl } from "../../src/core/permission-policy.js";

describe("redirect-bypass security", () => {
  const manifest = {
    browser: {
      domains: {
        allow: ["https://portal.vendor.example"]
      }
    }
  };

  it("SEC-REDIR-001 stops on redirects from allowed urls to external domains", () => {
    const decision = evaluateBrowserUrl(manifest, "https://portal.vendor.example/start", [
      "https://evil.example/landing"
    ]);
    expect(decision.allowed).toBe(false);
  });

  it("SEC-REDIR-002 stops on external iframe domains", () => {
    const decision = evaluateBrowserUrl(manifest, "https://portal.vendor.example/page", [
      "https://evil.example/frame"
    ]);
    expect(decision.allowed).toBe(false);
  });
});
