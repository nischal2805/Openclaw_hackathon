import type {
  ObligationManifest,
  Obligation,
  UpcomingObligation,
} from '../../../src/types/obligation.js';

type AlertTier = 'ADVISORY' | 'WARNING' | 'URGENT' | 'OVERDUE';

function getRecommendedAction(obligationType: Obligation['type']): string {
  switch (obligationType) {
    case 'renewal':
      return 'Review auto-renewal terms and send notice if cancelling';
    case 'termination_notice':
      return 'Issue termination notice immediately';
    case 'payment':
      return 'Confirm payment is scheduled';
    case 'sla_review':
      return 'Schedule SLA review meeting';
    case 'audit':
      return 'Prepare audit documentation';
    case 'penalty':
      return 'Review penalty clause and take preventive action';
    case 'other':
    default:
      return 'Review and action this obligation';
  }
}

export function formatAlert(
  tier: AlertTier,
  manifest: ObligationManifest,
  obligation: Obligation
): string {
  const { contract_id, parties } = manifest;
  const { counterparty } = parties;
  const action = getRecommendedAction(obligation.type);

  switch (tier) {
    case 'ADVISORY':
      return [
        '📋 CONTRACT REMINDER — 30 days',
        `Contract: ${contract_id}`,
        `Counterparty: ${counterparty}`,
        `Obligation: ${obligation.description}`,
        `Deadline: ${obligation.deadline ?? 'N/A'}`,
        `Days remaining: 30`,
        `Action: ${action}`,
      ].join('\n');

    case 'WARNING':
      return [
        '⚠️ CONTRACT WARNING — 7 days',
        `Contract: ${contract_id}`,
        `Counterparty: ${counterparty}`,
        `Obligation: ${obligation.description}`,
        `Deadline: ${obligation.deadline ?? 'N/A'}`,
        `Days remaining: 7`,
        `Action: ${action}`,
      ].join('\n');

    case 'URGENT':
      return [
        '🚨 URGENT — ACTION REQUIRED TOMORROW',
        `Contract: ${contract_id}`,
        `Counterparty: ${counterparty}`,
        `Obligation: ${obligation.description}`,
        `Deadline: ${obligation.deadline ?? 'N/A'}`,
        `Days remaining: 1`,
        `Action: ${action}`,
      ].join('\n');

    case 'OVERDUE':
      return [
        '❌ OVERDUE OBLIGATION',
        `Contract: ${contract_id}`,
        `Obligation: ${obligation.description}`,
        `Was due: ${obligation.deadline ?? 'N/A'}`,
        `Action required immediately.`,
      ].join('\n');
  }
}

function computeNextAlertDate(manifest: ObligationManifest): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thresholds = [1, 7, 30];
  let earliest: Date | null = null;

  for (const obligation of manifest.obligations) {
    if (obligation.resolved || !obligation.deadline) continue;

    const deadline = new Date(obligation.deadline);
    deadline.setHours(0, 0, 0, 0);

    for (const days of thresholds) {
      const alertDate = new Date(deadline);
      alertDate.setDate(alertDate.getDate() - days);

      if (alertDate >= today) {
        if (earliest === null || alertDate < earliest) {
          earliest = alertDate;
        }
      }
    }
  }

  if (earliest === null) {
    return 'No upcoming deadlines';
  }

  return earliest.toISOString().slice(0, 10);
}

export function formatConfirmation(manifest: ObligationManifest): string {
  const { contract_id, parties, dates, obligations, risk_flags } = manifest;
  const { org, counterparty } = parties;
  const effectiveDate = dates.effective_date ?? 'N/A';
  const endDate = dates.end_date ?? 'N/A';
  const obligationCount = obligations.length;
  const riskCount = risk_flags.length;

  const riskLines = risk_flags.map(
    (flag) => `  • [${flag.risk_level}] ${flag.clause_type}: ${flag.recommendation}`
  );

  const nextAlert = computeNextAlertDate(manifest);

  const lines = [
    `✅ Contract registered: ${contract_id}`,
    `Parties: ${org} ↔ ${counterparty}`,
    `Duration: ${effectiveDate} → ${endDate}`,
    `Obligations extracted: ${obligationCount}`,
    `Risk flags: ${riskCount}`,
    ...riskLines,
    `Next alert: ${nextAlert}`,
  ];

  return lines.join('\n');
}

const TIER_EMOJIS: Record<AlertTier, string> = {
  ADVISORY: '📋',
  WARNING: '⚠️',
  URGENT: '🚨',
  OVERDUE: '❌',
};

export function formatDailyDigest(upcomingObligations: UpcomingObligation[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const header = `📅 DAILY CONTRACT DIGEST — ${today}`;

  if (upcomingObligations.length === 0) {
    return `${header}\nNo obligations due in the next 30 days.`;
  }

  const sorted = [...upcomingObligations].sort(
    (a, b) => a.daysRemaining - b.daysRemaining
  );

  const lines = sorted.map((item) => {
    const emoji = TIER_EMOJIS[item.alertTier];
    return `${emoji} [${item.contractId}] ${item.obligation.description} — due ${item.obligation.deadline ?? 'N/A'} (${item.daysRemaining} days)`;
  });

  return [header, ...lines].join('\n');
}
