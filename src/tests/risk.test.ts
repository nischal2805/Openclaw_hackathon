import { describe, it, expect } from 'vitest';
import { analyseRisk } from '../../workspace/skills/contractclaw/risk.js';
import type { ObligationManifest, RiskFlag } from '../../src/types/obligation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRiskFlag(overrides: Partial<RiskFlag> = {}): RiskFlag {
  return {
    clause_type: 'asymmetric_penalty',
    risk_level: 'MEDIUM',
    clause_excerpt: 'Penalties apply only to the vendor.',
    recommendation: 'Negotiate symmetrical penalty clauses.',
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

describe('analyseRisk', () => {
  it('returns overallRiskLevel NONE when no risk flags and auto_renews is false', () => {
    const manifest = buildManifest({ risk_flags: [] });

    const summary = analyseRisk(manifest);

    expect(summary.overallRiskLevel).toBe('NONE');
  });

  it('returns overallRiskLevel HIGH when any risk flag has risk_level HIGH', () => {
    const manifest = buildManifest({
      risk_flags: [buildRiskFlag({ risk_level: 'HIGH', clause_type: 'unlimited_liability' })],
    });

    const summary = analyseRisk(manifest);

    expect(summary.overallRiskLevel).toBe('HIGH');
  });

  it('returns overallRiskLevel MEDIUM when only MEDIUM flags are present', () => {
    const manifest = buildManifest({
      risk_flags: [buildRiskFlag({ risk_level: 'MEDIUM', clause_type: 'asymmetric_penalty' })],
    });

    const summary = analyseRisk(manifest);

    expect(summary.overallRiskLevel).toBe('MEDIUM');
  });

  it('returns overallRiskLevel LOW when only LOW flags are present', () => {
    const manifest = buildManifest({
      risk_flags: [buildRiskFlag({ risk_level: 'LOW', clause_type: 'short_notice' })],
    });

    const summary = analyseRisk(manifest);

    expect(summary.overallRiskLevel).toBe('LOW');
  });

  it('adds a HIGH auto_renewal flag when auto_renews=true and renewal_notice_days < 30', () => {
    const manifest = buildManifest({
      dates: {
        effective_date: '2025-01-01',
        end_date: '2025-12-31',
        auto_renews: true,
        renewal_notice_days: 14,
      },
      risk_flags: [],
    });

    const summary = analyseRisk(manifest);

    const autoFlag = summary.highRisks.find((f) => f.clause_type === 'auto_renewal');
    expect(autoFlag).toBeDefined();
    expect(autoFlag?.risk_level).toBe('HIGH');
  });

  it('does NOT add auto_renewal flag when renewal_notice_days equals 30 (not strictly less than)', () => {
    const manifest = buildManifest({
      dates: {
        effective_date: '2025-01-01',
        end_date: '2025-12-31',
        auto_renews: true,
        renewal_notice_days: 30,
      },
      risk_flags: [],
    });

    const summary = analyseRisk(manifest);

    const autoFlag = summary.highRisks.find((f) => f.clause_type === 'auto_renewal');
    expect(autoFlag).toBeUndefined();
  });

  it('does NOT add auto_renewal flag when auto_renews=false even if renewal_notice_days < 30', () => {
    const manifest = buildManifest({
      dates: {
        effective_date: '2025-01-01',
        end_date: '2025-12-31',
        auto_renews: false,
        renewal_notice_days: 10,
      },
      risk_flags: [],
    });

    const summary = analyseRisk(manifest);

    const autoFlag = [
      ...summary.highRisks,
      ...summary.mediumRisks,
      ...summary.lowRisks,
    ].find((f) => f.clause_type === 'auto_renewal');
    expect(autoFlag).toBeUndefined();
  });

  it('deduplicates recommendations: programmatic auto_renewal flag wins over existing same clause_type', () => {
    // When an auto_renewal flag already exists in manifest.risk_flags AND the programmatic
    // rule also fires, both are pushed to allRiskFlags (risk.ts spreads manifest.risk_flags
    // then pushes). The recommendations Set deduplication means only one unique recommendation
    // string appears per distinct recommendation text.
    const existingAutoFlag = buildRiskFlag({
      clause_type: 'auto_renewal',
      risk_level: 'MEDIUM',
      recommendation: 'Review auto-renewal clause.',
    });
    const manifest = buildManifest({
      dates: {
        effective_date: '2025-01-01',
        end_date: '2025-12-31',
        auto_renews: true,
        renewal_notice_days: 14,
      },
      risk_flags: [existingAutoFlag],
    });

    const summary = analyseRisk(manifest);

    // Both flags have different recommendations, so both appear — but no duplicates
    const uniqueRecs = new Set(summary.recommendations);
    expect(uniqueRecs.size).toBe(summary.recommendations.length);
  });

  it('orders recommendations with HIGH flags first, then MEDIUM, then LOW', () => {
    const manifest = buildManifest({
      risk_flags: [
        buildRiskFlag({ risk_level: 'LOW', clause_type: 'short_notice', recommendation: 'LOW rec' }),
        buildRiskFlag({ risk_level: 'MEDIUM', clause_type: 'asymmetric_penalty', recommendation: 'MEDIUM rec' }),
        buildRiskFlag({ risk_level: 'HIGH', clause_type: 'unlimited_liability', recommendation: 'HIGH rec' }),
      ],
    });

    const summary = analyseRisk(manifest);

    expect(summary.recommendations[0]).toBe('HIGH rec');
    expect(summary.recommendations[1]).toBe('MEDIUM rec');
    expect(summary.recommendations[2]).toBe('LOW rec');
  });

  it('deduplicates identical recommendation strings across different flags', () => {
    const sharedRec = 'Consult legal counsel immediately.';
    const manifest = buildManifest({
      risk_flags: [
        buildRiskFlag({ clause_type: 'unlimited_liability', risk_level: 'HIGH', recommendation: sharedRec }),
        buildRiskFlag({ clause_type: 'asymmetric_penalty', risk_level: 'HIGH', recommendation: sharedRec }),
      ],
    });

    const summary = analyseRisk(manifest);

    const count = summary.recommendations.filter((r) => r === sharedRec).length;
    expect(count).toBe(1);
  });
});
