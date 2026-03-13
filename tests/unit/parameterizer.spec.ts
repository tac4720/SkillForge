import { describe, expect, it } from "vitest";

import { parameterizeCandidates } from "../../src/core/parameterizer.js";

describe("parameterizer", () => {
  it("PAR-001 extracts YYYY-MM values as parameter candidates", () => {
    const [result] = parameterizeCandidates([{ name: "invoice_month", value: "2026-03" }]);
    expect(result).toMatchObject({
      kind: "parameter",
      pattern: "^\\d{4}-\\d{2}$"
    });
  });

  it("PAR-002 extracts paths as parameter candidates", () => {
    const [result] = parameterizeCandidates([{ name: "download_dir", value: "~/Downloads/invoices" }]);
    expect(result).toMatchObject({
      kind: "parameter",
      type: "path"
    });
  });

  it("PAR-003 extracts repeated literals as parameter candidates", () => {
    const [result] = parameterizeCandidates([{ name: "vendor_name", value: "Acme Corp", occurrences: 3 }]);
    expect(result.kind).toBe("parameter");
  });

  it("PAR-004 classifies fixed parameter secret and derived values", () => {
    const [fixed, parameter, secret, derived] = parameterizeCandidates([
      { name: "literal", value: "one-off" },
      { name: "invoice_month", value: "2026-03" },
      { name: "password", value: "hunter2", hint: "secret" },
      { name: "filename", value: "2026-03.pdf", hint: "derived" }
    ]);

    expect(fixed.kind).toBe("fixed");
    expect(parameter.kind).toBe("parameter");
    expect(secret.kind).toBe("secret");
    expect(derived.kind).toBe("derived");
  });

  it("PAR-005 retains default values", () => {
    const [result] = parameterizeCandidates([
      { name: "download_dir", value: "~/Downloads", defaultValue: "~/Downloads" }
    ]);
    expect(result.defaultValue).toBe("~/Downloads");
  });

  it("PAR-006 retains required and optional metadata", () => {
    const [required, optional] = parameterizeCandidates([
      { name: "invoice_month", value: "2026-03", required: true },
      { name: "vendor", value: "Acme Corp", occurrences: 2, required: false }
    ]);

    expect(required.required).toBe(true);
    expect(optional.required).toBe(false);
  });

  it("PAR-007 does not parameterize invalid candidates", () => {
    const [result] = parameterizeCandidates([{ name: "bad", value: "" }]);
    expect(result.kind).toBe("fixed");
  });
});
