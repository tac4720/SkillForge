import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { evaluateBrowserUrl, evaluateShellCommand } from "../../src/core/permission-policy.js";

function sanitizeHostLabel(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return sanitized.length > 0 ? sanitized : "host";
}

describe("permission-policy property", () => {
  it("PROP-PERM-001 never allows denylisted commands with arbitrary arguments", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 5 }), (args) => {
        const decision = evaluateShellCommand(
          {
            shell: {
              allow: ["rm"],
              deny: ["rm"]
            }
          },
          "rm",
          args
        );

        expect(decision.allowed).toBe(false);
        return decision.code === "permission_denied";
      }),
      { numRuns: 100, seed: 4244 }
    );
  });

  it("PROP-PERM-002 never allows urls outside the allowlist for arbitrary paths and queries", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (hostSeed, pathSeed, querySeed) => {
        const host = `${sanitizeHostLabel(hostSeed)}.invalid`;
        const candidateUrl = `https://${host}/${encodeURIComponent(pathSeed)}?q=${encodeURIComponent(querySeed)}`;
        const decision = evaluateBrowserUrl(
          {
            browser: {
              domains: {
                allow: ["https://portal.vendor.example"]
              }
            }
          },
          candidateUrl
        );

        expect(decision.allowed).toBe(false);
        return decision.code === "permission_denied";
      }),
      { numRuns: 100, seed: 4245 }
    );
  });
});
