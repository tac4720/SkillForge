import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  PathSanitizationError,
  isPathWithinBase,
  sanitizePath
} from "../../src/core/path-sanitizer.js";

describe("path-sanitizer property", () => {
  const baseDir = "/workspace/base";

  it("PROP-PATH-001 never escapes the base directory for arbitrary input", () => {
    fc.assert(
      fc.property(fc.string(), (inputPath) => {
        try {
          const output = sanitizePath({ baseDir, inputPath });
          return isPathWithinBase(baseDir, output);
        } catch (error) {
          return error instanceof PathSanitizationError;
        }
      }),
      { numRuns: 200, seed: 4242 }
    );
  });

  it("PROP-PATH-002 always normalizes to a safe path or throws", () => {
    fc.assert(
      fc.property(fc.string(), (inputPath) => {
        try {
          const output = sanitizePath({ baseDir, inputPath });
          expect(output).toBeTypeOf("string");
          return isPathWithinBase(baseDir, output);
        } catch (error) {
          return error instanceof PathSanitizationError;
        }
      }),
      { numRuns: 200, seed: 4243 }
    );
  });
});
