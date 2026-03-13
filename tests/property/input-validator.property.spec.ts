import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { validateInputs } from "../../src/core/input-validator.js";

describe("input-validator property", () => {
  it("PROP-INP-001 always rejects schema-mismatched input", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.integer(), { maxLength: 3 }),
          fc.object()
        ),
        (value) => {
          const result = validateInputs(
            {
              invoice_month: { type: "string", required: true }
            },
            { invoice_month: value }
          );

          expect(result.valid).toBe(false);
          return result.issues.some((issue) => issue.code === "type");
        }
      ),
      { numRuns: 100, seed: 4246 }
    );
  });

  it("PROP-INP-002 always rejects strings outside enum values", () => {
    fc.assert(
      fc.property(fc.string().filter((value) => !["draft", "final"].includes(value)), (value) => {
        const result = validateInputs(
          {
            status: { type: "enum", required: true, enum: ["draft", "final"] }
          },
          { status: value }
        );

        expect(result.valid).toBe(false);
        return result.issues.some((issue) => issue.code === "enum");
      }),
      { numRuns: 100, seed: 4247 }
    );
  });
});
