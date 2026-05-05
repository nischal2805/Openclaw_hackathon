import type {
  ObligationManifest,
  Obligation,
  RiskFlag,
  ContractDiff,
} from '../../../src/types/obligation.js';

export function diffContracts(
  oldManifest: ObligationManifest,
  newManifest: ObligationManifest
): ContractDiff {
  const contractId = newManifest.contract_id;

  // Create maps for easier lookup by id/clause_type
  const oldObligationsMap = new Map(
    oldManifest.obligations.map((o) => [o.id, o])
  );
  const newObligationsMap = new Map(
    newManifest.obligations.map((o) => [o.id, o])
  );

  const oldRiskFlagsMap = new Map(
    oldManifest.risk_flags.map((r) => [r.clause_type, r])
  );
  const newRiskFlagsMap = new Map(
    newManifest.risk_flags.map((r) => [r.clause_type, r])
  );

  // Find added obligations (in new but not in old)
  const addedObligations: Obligation[] = [];
  for (const obligation of newManifest.obligations) {
    if (!oldObligationsMap.has(obligation.id)) {
      addedObligations.push(obligation);
    }
  }

  // Find removed obligations (in old but not in new)
  const removedObligations: Obligation[] = [];
  for (const obligation of oldManifest.obligations) {
    if (!newObligationsMap.has(obligation.id)) {
      removedObligations.push(obligation);
    }
  }

  // Find changed deadlines (in both, but deadline changed)
  const changedDeadlines: Array<{
    id: string;
    oldDeadline: string | null;
    newDeadline: string | null;
  }> = [];
  for (const newObligation of newManifest.obligations) {
    const oldObligation = oldObligationsMap.get(newObligation.id);
    if (
      oldObligation &&
      oldObligation.deadline !== newObligation.deadline
    ) {
      changedDeadlines.push({
        id: newObligation.id,
        oldDeadline: oldObligation.deadline,
        newDeadline: newObligation.deadline,
      });
    }
  }

  // Find new risk flags (in new but not in old, by clause_type)
  const newRiskFlags: RiskFlag[] = [];
  for (const riskFlag of newManifest.risk_flags) {
    if (!oldRiskFlagsMap.has(riskFlag.clause_type)) {
      newRiskFlags.push(riskFlag);
    }
  }

  // Find resolved risk flags (in old but not in new, by clause_type)
  const resolvedRiskFlags: RiskFlag[] = [];
  for (const riskFlag of oldManifest.risk_flags) {
    if (!newRiskFlagsMap.has(riskFlag.clause_type)) {
      resolvedRiskFlags.push(riskFlag);
    }
  }

  return {
    contractId,
    addedObligations,
    removedObligations,
    changedDeadlines,
    newRiskFlags,
    resolvedRiskFlags,
  };
}
