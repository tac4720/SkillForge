import { describe, expect, it } from "vitest";

import { NonInteractiveApprovalGate } from "../../src/security/non-interactive-approval-gate.js";

describe("non-interactive approval gate", () => {
  it("SEC-NI-001 defaults to expired approvals", async () => {
    const gate = new NonInteractiveApprovalGate();

    await expect(gate.requestApproval({ title: "Approve", summary: "summary" })).resolves.toEqual({
      status: "expired"
    });
  });

  it("SEC-NI-002 returns the configured approval status", async () => {
    const gate = new NonInteractiveApprovalGate("approved");

    await expect(gate.requestApproval({ title: "Approve", summary: "summary" })).resolves.toEqual({
      status: "approved"
    });
  });
});
