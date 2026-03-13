import { describe, expect, it } from "vitest";

import { redactSecrets } from "../../src/security/secret-redactor.js";

describe("redact", () => {
  it("RED-001 replaces a secret value with [REDACTED]", () => {
    expect(redactSecrets("token=secret123", ["secret123"])).toBe("token=[REDACTED]");
  });

  it("RED-002 replaces multiple secrets", () => {
    expect(redactSecrets("user=alice password=hunter2 otp=123456", ["hunter2", "123456"])).toBe(
      "user=alice password=[REDACTED] otp=[REDACTED]"
    );
  });

  it("RED-003 removes secrets from long logs", () => {
    const log = "start\nlogin ok\nsession=super-secret-session\nend";
    const redacted = redactSecrets(log, ["super-secret-session"]);
    expect(redacted).not.toContain("super-secret-session");
    expect(redacted).toContain("[REDACTED]");
  });

  it("RED-004 removes secrets from exporter output candidates", () => {
    const candidate = "credential_ref=vendor_login\npassword=hunter2";
    expect(redactSecrets(candidate, ["hunter2"])).not.toContain("hunter2");
  });

  it("RED-005 removes secrets from crash report text", () => {
    const crashReport = "Error: request failed with apiKey=sk-live-123456";
    expect(redactSecrets(crashReport, ["sk-live-123456"])).toBe(
      "Error: request failed with apiKey=[REDACTED]"
    );
  });
});
