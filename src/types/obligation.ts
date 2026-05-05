export interface Obligation {
  id: string;
  type: 'renewal' | 'termination_notice' | 'payment' | 'sla_review' | 'audit' | 'penalty' | 'other';
  description: string;
  deadline: string | null;
  recurring: boolean;
  recurrence_pattern: 'monthly' | 'quarterly' | 'annually' | null;
  party_responsible: 'org' | 'counterparty' | 'both';
  resolved: boolean;
  alert_log: AlertLogEntry[];
}

export interface AlertLogEntry {
  tier: 'ADVISORY' | 'WARNING' | 'URGENT' | 'OVERDUE';
  sent_at: string;
}

export interface RiskFlag {
  clause_type: string;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  clause_excerpt: string;
  recommendation: string;
}

export interface ObligationManifest {
  contract_id: string;
  parties: {
    org: string;
    counterparty: string;
  };
  contract_type: string;
  governing_law: string;
  dates: {
    effective_date: string | null;
    end_date: string | null;
    auto_renews: boolean;
    renewal_notice_days: number | null;
  };
  obligations: Obligation[];
  risk_flags: RiskFlag[];
  extraction_confidence: number;
  raw_text_length: number;
  registered_at: string;
  source_filename: string;
  version: number;
}

export interface UpcomingObligation {
  contractId: string;
  counterparty: string;
  obligation: Obligation;
  daysRemaining: number;
  alertTier: 'ADVISORY' | 'WARNING' | 'URGENT' | 'OVERDUE';
}

export interface ContractDiff {
  contractId: string;
  addedObligations: Obligation[];
  removedObligations: Obligation[];
  changedDeadlines: { id: string; oldDeadline: string | null; newDeadline: string | null }[];
  newRiskFlags: RiskFlag[];
  resolvedRiskFlags: RiskFlag[];
}

export interface RiskSummary {
  contractId: string;
  highRisks: RiskFlag[];
  mediumRisks: RiskFlag[];
  lowRisks: RiskFlag[];
  overallRiskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  recommendations: string[];
}

export class ContractClawError extends Error {
  constructor(
    public readonly code: 'PARSE_FAILED' | 'EXTRACTION_FAILED' | 'REGISTRY_ERROR' | 'ALERT_FAILED' | 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE',
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ContractClawError';
  }
}
