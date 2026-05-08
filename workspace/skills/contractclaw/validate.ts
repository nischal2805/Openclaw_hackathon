import { ContractClawError } from '../../../src/types/obligation.js';
import type { ObligationManifest, Obligation, RiskFlag } from '../../../src/types/obligation.js';

const CONTRACT_TYPES = new Set(['service', 'employment', 'lease', 'license', 'vendor', 'other']);
const OBLIGATION_TYPES = new Set([
  'renewal', 'termination_notice', 'payment', 'sla_review', 'audit', 'penalty', 'other',
]);
const RECURRENCE_PATTERNS = new Set(['monthly', 'quarterly', 'annually']);
const PARTY_RESPONSIBLE = new Set(['org', 'counterparty', 'both']);
const RISK_LEVELS = new Set(['HIGH', 'MEDIUM', 'LOW']);

function isValidDate(val: unknown): val is string | null {
  return val === null || (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val));
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function validateObligation(item: unknown, index: number, issues: string[]): Obligation | null {
  if (!isPlainObject(item)) {
    issues.push(`obligations[${index}]: must be an object`);
    return null;
  }

  const prefix = `obligations[${index}]`;
  let valid = true;

  if (!isNonEmptyString(item['id'])) {
    issues.push(`${prefix}.id: must be a non-empty string`);
    valid = false;
  }

  if (typeof item['type'] !== 'string' || !OBLIGATION_TYPES.has(item['type'])) {
    issues.push(
      `${prefix}.type: must be one of renewal|termination_notice|payment|sla_review|audit|penalty|other`,
    );
    valid = false;
  }

  if (!isNonEmptyString(item['description'])) {
    issues.push(`${prefix}.description: must be a non-empty string`);
    valid = false;
  }

  if (!isValidDate(item['deadline'])) {
    issues.push(`${prefix}.deadline: must be a YYYY-MM-DD string or null`);
    valid = false;
  }

  if (typeof item['recurring'] !== 'boolean') {
    issues.push(`${prefix}.recurring: must be a boolean`);
    valid = false;
  }

  const rp = item['recurrence_pattern'];
  if (rp !== null && (typeof rp !== 'string' || !RECURRENCE_PATTERNS.has(rp))) {
    issues.push(`${prefix}.recurrence_pattern: must be monthly|quarterly|annually or null`);
    valid = false;
  }

  if (typeof item['party_responsible'] !== 'string' || !PARTY_RESPONSIBLE.has(item['party_responsible'])) {
    issues.push(`${prefix}.party_responsible: must be one of org|counterparty|both`);
    valid = false;
  }

  if (!valid) return null;

  // Coerce optional fields rather than rejecting
  const resolved: boolean = typeof item['resolved'] === 'boolean' ? item['resolved'] : false;
  const alertLog: unknown[] = Array.isArray(item['alert_log']) ? item['alert_log'] : [];

  return {
    id: item['id'] as string,
    type: item['type'] as Obligation['type'],
    description: item['description'] as string,
    deadline: item['deadline'] as string | null,
    recurring: item['recurring'] as boolean,
    recurrence_pattern: (item['recurrence_pattern'] as Obligation['recurrence_pattern']) ?? null,
    party_responsible: item['party_responsible'] as Obligation['party_responsible'],
    resolved,
    alert_log: alertLog as Obligation['alert_log'],
  };
}

function validateRiskFlag(item: unknown, index: number, issues: string[]): RiskFlag | null {
  if (!isPlainObject(item)) {
    issues.push(`risk_flags[${index}]: must be an object`);
    return null;
  }

  const prefix = `risk_flags[${index}]`;
  let valid = true;

  if (!isNonEmptyString(item['clause_type'])) {
    issues.push(`${prefix}.clause_type: must be a non-empty string`);
    valid = false;
  }

  if (typeof item['risk_level'] !== 'string' || !RISK_LEVELS.has(item['risk_level'])) {
    issues.push(`${prefix}.risk_level: must be one of HIGH|MEDIUM|LOW`);
    valid = false;
  }

  if (typeof item['clause_excerpt'] !== 'string') {
    issues.push(`${prefix}.clause_excerpt: must be a string`);
    valid = false;
  }

  if (!isNonEmptyString(item['recommendation'])) {
    issues.push(`${prefix}.recommendation: must be a non-empty string`);
    valid = false;
  }

  if (!valid) return null;

  return {
    clause_type: item['clause_type'] as string,
    risk_level: item['risk_level'] as RiskFlag['risk_level'],
    clause_excerpt: item['clause_excerpt'] as string,
    recommendation: item['recommendation'] as string,
  };
}

export function validateManifest(raw: unknown): ObligationManifest {
  const issues: string[] = [];

  if (!isPlainObject(raw)) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'Claude response is not a JSON object.',
    );
  }

  // --- contract_id ---
  if (
    typeof raw['contract_id'] !== 'string' ||
    raw['contract_id'].trim().length === 0 ||
    !/^[a-z0-9-]+$/.test(raw['contract_id'])
  ) {
    issues.push('contract_id: must be a non-empty string matching /^[a-z0-9-]+$/');
  }

  // --- parties ---
  if (!isPlainObject(raw['parties'])) {
    issues.push('parties: must be an object');
  } else {
    if (!isNonEmptyString(raw['parties']['org'])) {
      issues.push('parties.org: must be a non-empty string');
    }
    if (!isNonEmptyString(raw['parties']['counterparty'])) {
      issues.push('parties.counterparty: must be a non-empty string');
    }
  }

  // --- contract_type ---
  if (typeof raw['contract_type'] !== 'string' || !CONTRACT_TYPES.has(raw['contract_type'])) {
    issues.push('contract_type: must be one of service|employment|lease|license|vendor|other');
  }

  // --- governing_law ---
  if (typeof raw['governing_law'] !== 'string') {
    issues.push('governing_law: must be a string');
  }

  // --- dates ---
  if (!isPlainObject(raw['dates'])) {
    issues.push('dates: must be an object');
  } else {
    const d = raw['dates'];

    if (!isValidDate(d['effective_date'])) {
      issues.push('dates.effective_date: must be a YYYY-MM-DD string or null');
    }
    if (!isValidDate(d['end_date'])) {
      issues.push('dates.end_date: must be a YYYY-MM-DD string or null');
    }
    if (typeof d['auto_renews'] !== 'boolean') {
      issues.push('dates.auto_renews: must be a boolean');
    }

    const rnd = d['renewal_notice_days'];
    if (
      rnd !== null &&
      !(typeof rnd === 'number' && Number.isInteger(rnd) && rnd > 0)
    ) {
      issues.push('dates.renewal_notice_days: must be a positive integer or null');
    }
  }

  // --- obligations ---
  const validatedObligations: Obligation[] = [];
  if (!Array.isArray(raw['obligations'])) {
    issues.push('obligations: must be an array');
  } else {
    for (let i = 0; i < raw['obligations'].length; i++) {
      const result = validateObligation(raw['obligations'][i], i, issues);
      if (result !== null) validatedObligations.push(result);
    }
  }

  // --- risk_flags ---
  const validatedRiskFlags: RiskFlag[] = [];
  if (!Array.isArray(raw['risk_flags'])) {
    issues.push('risk_flags: must be an array');
  } else {
    for (let i = 0; i < raw['risk_flags'].length; i++) {
      const result = validateRiskFlag(raw['risk_flags'][i], i, issues);
      if (result !== null) validatedRiskFlags.push(result);
    }
  }

  // --- extraction_confidence ---
  const ec = raw['extraction_confidence'];
  if (typeof ec !== 'number' || ec < 0.0 || ec > 1.0) {
    issues.push('extraction_confidence: must be a number between 0.0 and 1.0');
  }

  // --- raw_text_length ---
  const rtl = raw['raw_text_length'];
  if (!(typeof rtl === 'number' && Number.isInteger(rtl) && rtl > 0)) {
    issues.push('raw_text_length: must be a positive integer');
  }

  if (issues.length > 0) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      `Claude response failed validation (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((msg) => `  - ${msg}`).join('\n'),
      { validationIssues: issues },
    );
  }

  // All validations passed — assemble the manifest, injecting defaults for optional fields
  const parties = raw['parties'] as Record<string, unknown>;
  const dates = raw['dates'] as Record<string, unknown>;

  return {
    contract_id: raw['contract_id'] as string,
    parties: {
      org: parties['org'] as string,
      counterparty: parties['counterparty'] as string,
    },
    contract_type: raw['contract_type'] as string,
    governing_law: raw['governing_law'] as string,
    dates: {
      effective_date: dates['effective_date'] as string | null,
      end_date: dates['end_date'] as string | null,
      auto_renews: dates['auto_renews'] as boolean,
      renewal_notice_days: dates['renewal_notice_days'] as number | null,
    },
    obligations: validatedObligations,
    risk_flags: validatedRiskFlags,
    extraction_confidence: raw['extraction_confidence'] as number,
    raw_text_length: raw['raw_text_length'] as number,
    // Injected fields — preserve existing values if present, otherwise default
    registered_at:
      typeof raw['registered_at'] === 'string'
        ? raw['registered_at']
        : new Date().toISOString(),
    source_filename:
      typeof raw['source_filename'] === 'string' ? raw['source_filename'] : 'unknown',
    version: typeof raw['version'] === 'number' && raw['version'] > 0 ? raw['version'] : 1,
  };
}
