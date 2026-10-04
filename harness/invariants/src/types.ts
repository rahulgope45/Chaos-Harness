export type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5" | "I6";
export type InvariantStatus = "pass" | "fail" | "report";
export type Violation = Record<string, unknown>;

export interface JournalEntry {
  run_id: string;
  key: string;
  request_hash: string;
  attempt: number;
  status: number | null;
  payment_id: string | null;
}

export interface InvariantResult {
  invariant: InvariantId;
  status: InvariantStatus;
  violations: Violation[];
  evidence: Record<string, unknown>;
}

export interface CheckContext {
  journal: JournalEntry[];
  faultInjected: boolean;
  duplicatePolicy: "report" | "fail";
  drainTimeoutMs: number;
}

export interface InvariantSource {
  queryI1(context: CheckContext): Promise<Violation[]>;
  queryI2(context: CheckContext): Promise<Violation[]>;
  queryI3(context: CheckContext): Promise<Violation[]>;
  queryI4(context: CheckContext): Promise<Violation[]>;
  queryI5(context: CheckContext): Promise<Violation[]>;
  queryI6(context: CheckContext): Promise<Violation[]>;
  close(): Promise<void>;
}
