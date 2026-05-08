import { describe, it, expect } from 'vitest';
import { validateManifest } from '../../workspace/skills/contractclaw/validate.js';
import { ContractClawError } from '../../src/types/obligation.js';
import type { ObligationManifest } from '../../src/types/obligation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a fully valid raw manifest object (typed as unknown so it can be
 * passed to validateManifest without TypeScript complaining about deliberate
 * mutations in individual test cases).
 */
function buildValidRaw(): Record<string, unknown> {
  return {
    contract_id: 'acme-corp-2025-06',
    parties: {
      org: 'MyOrg',
      counterparty: 'Acme Corp',
    },
    contract_type: 'service',
    governing_law: 'India',
    dates: {
      effective_date: '2025-01-01',
      end_date: '2025-12-31',
      auto_renews: false,
      renewal_notice_days: null,
    },
    obligations: [
      {
        id: 'ob-1',
        type: 'payment',
        description: 'Quarterly payment milestone',
        deadline: '2025-09-30',
        recurring: false,
        recurrence_pattern: null,
        party_responsible: 'org',
        resolved: false,
        alert_log: [],
      },
    ],
    risk_flags: [
      {
        clause_type: 'unlimited_liability',
        risk_level: 'HIGH',
        clause_excerpt: 'Liability is unlimited under clause 12.',
        recommendation: 'Cap liability in negotiations.',
      },
    ],
    extraction_confidence: 0.92,
    raw_text_length: 4800,
    registered_at: '2025-06-01T08:00:00.000Z',
    source_filename: 'acme-contract.pdf',
    version: 1,
  };
}

// Convenience: assert that calling validateManifest with the given raw input
// throws a ContractClawError with code EXTRACTION_FAILED.
function expectExtractionError(raw: unknown): ContractClawError {
  let caught: unknown;
  try {
    validateManifest(raw);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ContractClawError);
  const ccErr = caught as ContractClawError;
  expect(ccErr.code).toBe('EXTRACTION_FAILED');
  return ccErr;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  it('returns a well-formed ObligationManifest for a valid complete input', () => {
    const raw = buildValidRaw();

    const result = validateManifest(raw) as ObligationManifest;

    expect(result.contract_id).toBe('acme-corp-2025-06');
    expect(result.parties.org).toBe('MyOrg');
    expect(result.obligations).toHaveLength(1);
    expect(result.risk_flags).toHaveLength(1);
  });

  it('throws ContractClawError EXTRACTION_FAILED when contract_id is missing', () => {
    const raw = buildValidRaw();
    delete raw['contract_id'];

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/contract_id/);
  });

  it('throws when contract_id contains uppercase letters', () => {
    const raw = buildValidRaw();
    raw['contract_id'] = 'Acme-Corp-2025';

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/contract_id/);
  });

  it('throws when contract_id contains spaces', () => {
    const raw = buildValidRaw();
    raw['contract_id'] = 'acme corp 2025';

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/contract_id/);
  });

  it('throws when parties.org is missing', () => {
    const raw = buildValidRaw();
    delete (raw['parties'] as Record<string, unknown>)['org'];

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/parties\.org/);
  });

  it('throws when dates.effective_date is not YYYY-MM-DD format', () => {
    const raw = buildValidRaw();
    (raw['dates'] as Record<string, unknown>)['effective_date'] = '01-01-2025';

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/effective_date/);
  });

  it('throws when extraction_confidence is greater than 1.0', () => {
    const raw = buildValidRaw();
    raw['extraction_confidence'] = 1.5;

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/extraction_confidence/);
  });

  it('throws when obligations[0].type is missing', () => {
    const raw = buildValidRaw();
    delete (raw['obligations'] as Record<string, unknown>[])[0]['type'];

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/obligations\[0\]\.type/);
  });

  it('throws when obligations[0].type has an invalid value', () => {
    const raw = buildValidRaw();
    (raw['obligations'] as Record<string, unknown>[])[0]['type'] = 'invoice';

    const err = expectExtractionError(raw);
    expect(err.message).toMatch(/obligations\[0\]\.type/);
  });

  it('coerces missing resolved to false without throwing', () => {
    const raw = buildValidRaw();
    delete (raw['obligations'] as Record<string, unknown>[])[0]['resolved'];

    const result = validateManifest(raw) as ObligationManifest;

    expect(result.obligations[0].resolved).toBe(false);
  });

  it('coerces missing alert_log to empty array without throwing', () => {
    const raw = buildValidRaw();
    delete (raw['obligations'] as Record<string, unknown>[])[0]['alert_log'];

    const result = validateManifest(raw) as ObligationManifest;

    expect(result.obligations[0].alert_log).toEqual([]);
  });

  it('injects a default registered_at when it is absent, without throwing', () => {
    const raw = buildValidRaw();
    delete raw['registered_at'];

    const result = validateManifest(raw) as ObligationManifest;

    expect(typeof result.registered_at).toBe('string');
    expect(result.registered_at.length).toBeGreaterThan(0);
  });

  it('throws a single error listing ALL validation issues when multiple fields are invalid', () => {
    const raw = buildValidRaw();
    // Corrupt three independent fields simultaneously
    raw['contract_id'] = 'INVALID ID';
    raw['extraction_confidence'] = 2.0;
    delete (raw['parties'] as Record<string, unknown>)['org'];

    const err = expectExtractionError(raw);

    // The error message should reference each broken field
    expect(err.message).toMatch(/contract_id/);
    expect(err.message).toMatch(/extraction_confidence/);
    expect(err.message).toMatch(/parties\.org/);

    // The context should carry the full issues list
    const issues = err.context?.['validationIssues'] as string[];
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});
