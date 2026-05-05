import type {
  ObligationManifest,
  RiskFlag,
  RiskSummary,
} from '../../../src/types/obligation.js';

export function analyseRisk(manifest: ObligationManifest): RiskSummary {
  const allRiskFlags: RiskFlag[] = [...manifest.risk_flags];

  // Rule: Auto-renewal with short notice window
  if (
    manifest.dates.auto_renews === true &&
    manifest.dates.renewal_notice_days !== null &&
    manifest.dates.renewal_notice_days < 30
  ) {
    allRiskFlags.push({
      clause_type: 'auto_renewal',
      risk_level: 'HIGH',
      clause_excerpt: `Auto-renewal with ${manifest.dates.renewal_notice_days}-day notice window`,
      recommendation:
        'Send cancellation notice immediately if not renewing',
    });
  }

  // Categorise by risk level
  const highRisks = allRiskFlags.filter((flag) => flag.risk_level === 'HIGH');
  const mediumRisks = allRiskFlags.filter(
    (flag) => flag.risk_level === 'MEDIUM'
  );
  const lowRisks = allRiskFlags.filter((flag) => flag.risk_level === 'LOW');

  // Determine overall risk level
  let overallRiskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE';
  if (highRisks.length > 0) {
    overallRiskLevel = 'HIGH';
  } else if (mediumRisks.length > 0) {
    overallRiskLevel = 'MEDIUM';
  } else if (lowRisks.length > 0) {
    overallRiskLevel = 'LOW';
  }

  // Collect recommendations in priority order (HIGH first)
  const recommendationsSet = new Set<string>();
  for (const flag of [...highRisks, ...mediumRisks, ...lowRisks]) {
    if (flag.recommendation) {
      recommendationsSet.add(flag.recommendation);
    }
  }
  const recommendations = Array.from(recommendationsSet);

  return {
    contractId: manifest.contract_id,
    highRisks,
    mediumRisks,
    lowRisks,
    overallRiskLevel,
    recommendations,
  };
}
