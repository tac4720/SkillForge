import type {
  ApprovalDecision,
  ApprovalGate,
  ApprovalRequest,
  ApprovalStatus
} from "../../src/security/approval-gate.js";

export class FakeApprovalGate implements ApprovalGate {
  private readonly responses: ApprovalStatus[] = [];

  enqueue(status: ApprovalStatus): void {
    this.responses.push(status);
  }

  async requestApproval(_request: ApprovalRequest): Promise<ApprovalDecision> {
    return {
      status: this.responses.shift() ?? "expired"
    };
  }
}
