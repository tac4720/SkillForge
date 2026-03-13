import { describe, expect, it } from "vitest";

import {
  InputValidationError,
  assertValidInputs,
  validateInputs,
  type InputSchema
} from "../../src/core/input-validator.js";

describe("input-validator", () => {
  it("INP-001 fails when a required parameter is missing", () => {
    const schema: InputSchema = {
      invoice_month: { type: "string", required: true }
    };

    const result = validateInputs(schema, {});
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        key: "invoice_month",
        code: "required"
      })
    );
  });

  it("INP-002 enforces regex validation", () => {
    const schema: InputSchema = {
      invoice_month: { type: "string", required: true, pattern: "^\\d{4}-\\d{2}$" }
    };

    expect(validateInputs(schema, { invoice_month: "2026-03" }).valid).toBe(true);
    expect(validateInputs(schema, { invoice_month: "03/2026" }).valid).toBe(false);
  });

  it("INP-003 enforces enum validation", () => {
    const schema: InputSchema = {
      status: { type: "enum", required: true, enum: ["draft", "final"] }
    };

    expect(validateInputs(schema, { status: "draft" }).valid).toBe(true);
    expect(validateInputs(schema, { status: "invalid" }).issues).toContainEqual(
      expect.objectContaining({
        key: "status",
        code: "enum"
      })
    );
  });

  it("INP-004 enforces date-like patterns", () => {
    const schema: InputSchema = {
      run_date: { type: "date", required: true }
    };

    expect(validateInputs(schema, { run_date: "2026-03-13" }).valid).toBe(true);
    expect(validateInputs(schema, { run_date: "20260313" }).valid).toBe(false);
  });

  it("INP-005 enforces path type validation", () => {
    const schema: InputSchema = {
      download_dir: { type: "path", required: true }
    };

    expect(validateInputs(schema, { download_dir: "./out" }).valid).toBe(true);
    expect(validateInputs(schema, { download_dir: "bad\0path" }).valid).toBe(false);
  });

  it("INP-006 enforces url type validation", () => {
    const schema: InputSchema = {
      target_url: { type: "url", required: true }
    };

    expect(validateInputs(schema, { target_url: "https://portal.vendor.example" }).valid).toBe(true);
    expect(validateInputs(schema, { target_url: "ftp://portal.vendor.example" }).valid).toBe(false);
  });

  it("INP-007 enforces email type validation", () => {
    const schema: InputSchema = {
      recipient: { type: "email", required: true }
    };

    expect(validateInputs(schema, { recipient: "person@example.com" }).valid).toBe(true);
    expect(validateInputs(schema, { recipient: "not-an-email" }).valid).toBe(false);
  });

  it("INP-008 fails before replay on invalid input", () => {
    const schema: InputSchema = {
      invoice_month: { type: "string", required: true, pattern: "^\\d{4}-\\d{2}$" }
    };

    expect(() => assertValidInputs(schema, { invoice_month: "March" })).toThrowError(InputValidationError);
  });

  it("INP-009 enforces scalar runtime types", () => {
    const schema: InputSchema = {
      retry_count: { type: "integer", required: true },
      threshold: { type: "number", required: true },
      dry_run: { type: "boolean", required: true },
      executed_at: { type: "datetime", required: true },
      api_token: { type: "secret", required: true }
    };

    expect(
      validateInputs(schema, {
        retry_count: 2,
        threshold: 0.5,
        dry_run: false,
        executed_at: "2026-03-13T12:00:00.000Z",
        api_token: "secret-value"
      }).valid
    ).toBe(true);

    const invalid = validateInputs(schema, {
      retry_count: 2.5,
      threshold: Number.POSITIVE_INFINITY,
      dry_run: "false",
      executed_at: "not-a-datetime",
      api_token: 1234
    });
    expect(invalid.issues.map((issue) => issue.key).sort()).toEqual([
      "api_token",
      "dry_run",
      "executed_at",
      "retry_count",
      "threshold"
    ]);
  });

  it("INP-010 accepts json objects and schema defaults", () => {
    const schema: InputSchema = {
      payload: { type: "json", required: true },
      region: { type: "string", default: "ap-northeast-1" }
    };

    const valid = validateInputs(schema, { payload: { ok: true } });
    expect(valid.valid).toBe(true);
    expect(valid.values.region).toBe("ap-northeast-1");

    const invalid = validateInputs(schema, { payload: null });
    expect(invalid.issues).toContainEqual(
      expect.objectContaining({
        key: "payload",
        code: "type"
      })
    );
  });
});
