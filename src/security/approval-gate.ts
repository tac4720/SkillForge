export type ApprovalStatus = "approved" | "rejected" | "expired";

export interface ApprovalRequest {
  title: string;
  summary?: string;
}

export interface ApprovalDecision {
  status: ApprovalStatus;
}

export interface ApprovalGate {
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;
}
