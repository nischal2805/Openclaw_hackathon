import { describe, it, expect } from 'vitest';
import { diffContracts } from '../../workspace/skills/contractclaw/diff.js';
import type { ObligationManifest, Obligation, RiskFlag } from '../../src/types/obligation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildObligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'ob-1',
    type: 'payment',
    description: 'Quarterly payment',
    deadline: '2025-09-30',
    recurring: false,
    recurrence_pattern: null,
    party_responsible: 'org',
    resolved: false,
    alert_log: [],
    ...overrides,
  };
}

function buildRiskFlag(overrides: Partial<RiskFlag> = {}): RiskFlag {
  return {
    clause_type: 'auto_renewal',
    risk_level: 'HIGH',
    clause_excerpt: 'Contract renews automatically.',
    recommendation: 'Send cancellation notice 30 days prior.',
    ...overrides,
  };
}

function buildManifest(overrides: Partial<ObligationManifest> = {}): ObligationManifest {
  return {
    contract_id: 'acme-corp-2025-06',
    parties: { org: 'MyOrg', counterparty: 'Acme Corp' },
    contract_type: 'service',
    governing_law: 'India',
    dates: {
      effective_date: '2025-01-01',
      end_date: '2025-12-31',
      auto_renews: false,
      renewal_notice_days: null,
    },
    obligations: [],
    risk_flags: [],
    extraction_confidence: 0.95,
    raw_text_length: 5000,
    registered_at: '2025-06-01T08:00:00.000Z',
    source_filename: 'acme-contract.pdf',
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diffContracts', () => {
  it('returns all empty arrays when both manifests are identical', () => {
    const manifest = buildManifest({
      obligations: [buildObligation()],
      risk_flags: [buildRiskFlag()],
    });

    const diff = diffContracts(manifest, manifest);

    expect(diff.addedObligations).toHaveLength(0);
    expect(diff.removedObligations).toHaveLength(0);
    expect(diff.changedDeadlines).toHaveLength(0);
    expect(diff.newRiskFlags).toHaveLength(0);
    expect(diff.resolvedRiskFlags).toHaveLength(0);
  });

  it('detects an obligation present in new but absent in old as added', () => {
    const added = buildObligation({ id: 'ob-new', description: 'New SLA obligation' });
    const oldManifest = buildManifest({ obligations: [] });
    const newManifest = buildManifest({ obligations: [added] });

    const diff = diffContracts(oldManifest, newManifest);

    expect(diff.addedObligations).toHaveLength(1);
    expect(diff.addedObligations[0].id).toBe('ob-new');
  });

  it('detects an obligation present in old but absent in new as removed', () => {
    const removed = buildObligation({ id: 'ob-gone', description: 'Removed obligation' });
    const oldManifest = buildManifest({ obligations: [removed] });
    const newManifest = buildManifest({ obligations: [] });

    const diff = diffContracts(oldManifest, newManifest);

    expect(diff.removedObligations).toHaveLength(1);
    expect(diff.removedObligations[0].id).toBe('ob-gone');
  });

  it('detects a changed deadline for a shared obligation id', () => {
    const oldObligation = buildObligation({ id: 'ob-1', deadline: '2025-09-30' });
    const newObligation = buildObligation({ id: 'ob-1', deadline: '2025-10-31' });
    const oldManifest = buildManifest({ obligations: [oldObligation] });
    const newManifest = buildManifest({ obligations: [newObligation] });

    const diff = diffContracts(oldManifest, newManifest);

    expect(diff.changedDeadlines).toHaveLength(1);
    expect(diff.changedDeadlines[0]).toEqual({
      id: 'ob-1',
      oldDeadline: '2025-09-30',
      newDeadline: '2025-10-31',
    });
  });

  it('does NOT report a changedDeadline when the deadline is identical', () => {
    const obligation = buildObligation({ id: 'ob-1', deadline: '2025-09-30' });
    const oldManifest = buildManifest({ obligations: [obligation] });
    const newManifest = buildManifest({ obligations: [{ ...obligation }] });

    const diff = diffContracts(oldManifest, newManifest);

    expect(diff.changedDeadlines).toHaveLength(0);
  });

  it('detects a risk flag present in new but absent in old (by clause_type) as new', () => {
    const newFlag = buildRiskFlag({ clause_type: 'unlimited_liability', risk_level: 'HIGH' });
    const oldManifest = buildManifest({ risk_flags: [] });
    const newManifest = buildManifest({ risk_flags: [newFlag] });

    const diff = diffContracts(oldManifest, newManifest);

    expect(diff.newRiskFlags).toHaveLength(1);
    expect(diff.newRiskFlags[0].clause_type).toBe('unlimited_liability');
  });

  it('detects a risk flag present in old but absent in new (by clause_type) as resolved', () => {
    const oldFlag = buildRiskFlag({ clause_type: 'asymmetric_penalty', risk_level: 'MEDIUM' });
    const oldManifest = buildManifest({ risk_flags: [oldFlag] });
    const newManifest = buildManifest({ risk_flags: [] });

    const diff = diffContracts(oldManifest, newManifest);

    expect(diff.resolvedRiskFlags).toHaveLength(1);
    expect(diff.resolvedRiskFlags[0].clause_type).toBe('asymmetric_penalty');
  });

  it('uses newManifest.contract_id for the returned contractId', () => {
    const oldManifest = buildManifest({ contract_id: 'old-contract-2024' });
    const newManifest = buildManifest({ contract_id: 'new-contract-2025' });

    const diff = diffContracts(oldManifest, newManifest);

    expect(diff.contractId).toBe('new-contract-2025');
  });
});
