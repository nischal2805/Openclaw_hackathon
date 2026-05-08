import type { UpcomingObligation } from '../../../src/types/obligation.js';
import { loadAllContracts, updateObligation } from './registry.js';
import { formatAlert, formatDailyDigest } from './alert.js';
import { broadcastMessage } from './telegram.js';
import { logInfo, logError } from './logger.js';
import { loadTodaySentAlerts, persistSentAlerts, makeAlertKey } from './dedup.js';

type AlertTier = 'ADVISORY' | 'WARNING' | 'URGENT' | 'OVERDUE';

function determineAlertTier(daysRemaining: number): AlertTier | null {
  if (daysRemaining === 30) return 'ADVISORY';
  if (daysRemaining === 7) return 'WARNING';
  if (daysRemaining === 1) return 'URGENT';
  if (daysRemaining <= 0) return 'OVERDUE';
  return null;
}

function hasSentTodayForTier(alertLog: { tier: string; sent_at: string }[], tier: AlertTier): boolean {
  const todayPrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return alertLog.some(
    (entry) => entry.tier === tier && entry.sent_at.startsWith(todayPrefix)
  );
}

export async function runHeartbeat(chatIds: string[]): Promise<void> {
  await logInfo('Heartbeat started');

  const sentAlerts = await loadTodaySentAlerts();

  let contractsChecked = 0;
  let alertsSent = 0;

  try {
    const contracts = await loadAllContracts();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingObligations: UpcomingObligation[] = [];

    for (const manifest of contracts) {
      contractsChecked++;
      try {
        for (const obligation of manifest.obligations) {
          // Skip resolved obligations
          if (obligation.resolved === true) continue;

          // Skip obligations without a deadline
          if (obligation.deadline === null) continue;

          // Compute days remaining using plain Date math
          const deadline = new Date(obligation.deadline);
          deadline.setHours(0, 0, 0, 0);
          const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / 86400000);

          // Determine alert tier; skip if not a threshold day
          const tier = determineAlertTier(daysRemaining);
          if (tier === null) {
            // Not a threshold day — still collect for digest if within 30 days
            if (daysRemaining >= 0 && daysRemaining <= 30) {
              // Use nearest future tier for digest labelling, or ADVISORY as default
              const digestTier: AlertTier =
                daysRemaining <= 1 ? 'URGENT' : daysRemaining <= 7 ? 'WARNING' : 'ADVISORY';
              upcomingObligations.push({
                contractId: manifest.contract_id,
                counterparty: manifest.parties.counterparty,
                obligation,
                daysRemaining,
                alertTier: digestTier,
              });
            }
            continue;
          }

          const alertKey = makeAlertKey(manifest.contract_id, obligation.id, tier);

          // Check both state file AND alert_log for dedup
          if (sentAlerts.has(alertKey) || hasSentTodayForTier(obligation.alert_log, tier)) continue;

          // Write to state file BEFORE sending (crash-safe: missing one alert > duplicate alert)
          sentAlerts.add(alertKey);
          await persistSentAlerts(sentAlerts);

          // Format and broadcast the alert
          const alertText = formatAlert(tier, manifest, obligation);
          await broadcastMessage(chatIds, alertText);
          alertsSent++;

          // Append to obligation's alert_log
          await updateObligation(manifest.contract_id, obligation.id, {
            alert_log: [
              ...obligation.alert_log,
              { tier, sent_at: new Date().toISOString() },
            ],
          });

          // Include in digest as well (threshold day is still upcoming or overdue)
          if (daysRemaining >= 0 && daysRemaining <= 30) {
            upcomingObligations.push({
              contractId: manifest.contract_id,
              counterparty: manifest.parties.counterparty,
              obligation,
              daysRemaining,
              alertTier: tier,
            });
          }
        }
      } catch (contractError) {
        await logError(
          'HEARTBEAT_CONTRACT_FAILED',
          `Failed to process contract ${manifest.contract_id}: ${(contractError as Error).message}`,
          { contractId: manifest.contract_id },
        );
      }
    }

    // Send daily digest of all obligations due within the next 30 days
    const digestText = formatDailyDigest(upcomingObligations);
    await broadcastMessage(chatIds, digestText);

    await logInfo('Heartbeat complete', { contractsChecked, alertsSent });
  } catch (error) {
    await logError('HEARTBEAT_FAILED', (error as Error).message);
    // Do not rethrow — heartbeat must not crash the scheduler
  }
}
