import type { ApprovalDecision, ApprovalGate, ApprovalRequest } from "./approval-gate.ts";

export class NonInteractiveApprovalGate implements ApprovalGate {
  private readonly defaultStatus: ApprovalDecision["status"];

  constructor(defaultStatus: ApprovalDecision["status"] = "expired") {
    this.defaultStatus = defaultStatus;
  }

  async requestApproval(_request: ApprovalRequest): Promise<ApprovalDecision> {
    return {
      status: this.defaultStatus
    };
  }
}
