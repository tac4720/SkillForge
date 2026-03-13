import { describe, expect, it } from "vitest";

import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";

describe("approval-gate contract", () => {
  it("APPR-001 returns approved", async () => {
    const gate = new FakeApprovalGate();
    gate.enqueue("approved");

    await expect(gate.requestApproval({ title: "Proceed?" })).resolves.toEqual({
      status: "approved"
    });
  });

  it("APPR-002 returns rejected", async () => {
    const gate = new FakeApprovalGate();
    gate.enqueue("rejected");

    await expect(gate.requestApproval({ title: "Proceed?" })).resolves.toEqual({
      status: "rejected"
    });
  });

  it("APPR-003 returns timeout or expiration", async () => {
    const gate = new FakeApprovalGate();
    gate.enqueue("expired");

    await expect(gate.requestApproval({ title: "Proceed?" })).resolves.toEqual({
      status: "expired"
    });
  });
});
