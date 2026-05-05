# ContractClaw — Daily Deadline Heartbeat

## Schedule

- **Cron:** `0 8 * * *`
- **Timezone:** Asia/Kolkata (IST, UTC+5:30)
- **Fires:** Every day at 08:00 IST

---

## Entry Point

The heartbeat is triggered by the OpenClaw scheduler. On each fire, execute:

```typescript
import { runHeartbeat } from './skills/contractclaw/heartbeat.js';

const chatIds: string[] = openclaw.config.channels.telegram.allowFrom;
await runHeartbeat(chatIds);
```

`chatIds` is read at runtime from `channels.telegram.allowFrom` in `openclaw.json`.
All alerts and the daily digest are dispatched to every chat ID in this list.

---

## What `runHeartbeat(chatIds)` Does — Step by Step

1. **Load all contracts**
   Read every `.yaml` file from `workspace/registry/` using `loadAllContracts()`.
   If the directory is empty, send an "All clear — no contracts registered" digest
   and exit cleanly.

2. **Initialise today's date**
   Compute `today` as a UTC date string (YYYY-MM-DD). All deadline comparisons use
   UTC to avoid timezone drift between heartbeat runs.

3. **Iterate obligations**
   For each `ObligationManifest` and each `Obligation` within it:

   a. Skip if `obligation.resolved === true`.

   b. Skip if `obligation.deadline === null` (undated obligations cannot be evaluated).

   c. Compute:
      ```
      days_remaining = differenceInCalendarDays(obligation.deadline, today)
      ```

   d. Determine alert tier:
      | days_remaining | Alert Tier |
      |----------------|------------|
      | 30             | ADVISORY   |
      | 7              | WARNING    |
      | 1              | URGENT     |
      | 0 or negative  | OVERDUE    |
      | any other value| (no alert) |

   e. If an alert tier matches, check `obligation.alert_log` for an existing entry
      where `tier === matchedTier` AND `sent_at` date (UTC) equals today.
      If a matching entry exists, **skip** — do not send a duplicate.

   f. If no duplicate found, dispatch the alert using `formatAlert(tier, manifest, obligation)`
      and send to all `chatIds` via the Telegram channel.

   g. Append to `obligation.alert_log`:
      ```json
      { "tier": "<TIER>", "sent_at": "<ISO datetime UTC>" }
      ```
      Write the updated manifest back to `workspace/registry/<contract_id>.yaml`
      using `saveContract(manifest)`.

4. **Collect upcoming obligations**
   Build a list of all unresolved obligations where `days_remaining` is between
   0 and 30 (inclusive). Sort by `deadline` ascending.

5. **Send daily digest**
   Format and dispatch the digest to all `chatIds`:

   ```
   ContractClaw Daily Digest — {YYYY-MM-DD}
   Obligations due in next 30 days: {count}
   Overdue (unresolved): {overdue_count}

   {deadline} — {contract_id} | {counterparty}
     {obligation.type}: {obligation.description}
     Alert tier: {ADVISORY|WARNING|URGENT|OVERDUE}

   ... (sorted by deadline ascending)

   Monitoring {total_contract_count} contracts in registry.
   Next heartbeat: tomorrow at 08:00 IST.
   ```

   If no obligations are due within 30 days and none are overdue:
   ```
   ContractClaw Daily Digest — {YYYY-MM-DD}
   All obligations clear for the next 30 days.
   Monitoring {total_contract_count} contracts.
   Next obligation due: {nearest_future_deadline} ({contract_id})
   Next heartbeat: tomorrow at 08:00 IST.
   ```

---

## Alert Threshold Reference

| Threshold     | Tier     | Tone    | Urgency |
|---------------|----------|---------|---------|
| 30 days out   | ADVISORY | Calm    | Plan now |
| 7 days out    | WARNING  | Firm    | Act now  |
| 1 day out     | URGENT   | Sharp   | Act today |
| 0 / past due  | OVERDUE  | Critical| Escalate immediately |

---

## Failure Handling

If `runHeartbeat` throws at any point:

1. Catch the error in the heartbeat runner.

2. Log to `workspace/logs/error.log`:
   ```
   [ISO timestamp] HEARTBEAT_FAILED | {error.code || 'UNKNOWN'} | {error.message} | stack: {first 5 lines}
   ```

3. Send an error notification to all `chatIds`:
   ```
   ContractClaw heartbeat failed — {YYYY-MM-DD} 08:00 IST
   No deadline alerts were dispatched this cycle.
   Error: {error.code}
   Check workspace/logs/error.log for details.
   ```

4. Do not rethrow. Let the scheduler continue — the next day's heartbeat must
   still fire regardless of today's failure.

5. If the Telegram send itself fails during an alert dispatch, log the failure
   but continue processing remaining obligations. Partial alerting is better
   than a full abort.

---

## Skill Reference

All alert formatting is handled by the `contractclaw/alert` skill:

```typescript
import { formatAlert, formatDailyDigest } from './skills/contractclaw/alert.js';
import { loadAllContracts, saveContract } from './skills/contractclaw/registry.js';
```

Never call Telegram APIs directly from the heartbeat runner. Always route through
the skill layer so formatting and deduplication logic remains centralised.
