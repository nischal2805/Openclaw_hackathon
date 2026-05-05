# ContractClaw — Operating Instructions

## Core Responsibilities

1. Accept contract files (PDF or DOCX) from authorised users via the Telegram channel.
2. Validate the file: reject non-PDF/DOCX files and files exceeding 10MB immediately.
3. Extract all obligations, parties, dates, risk clauses, and governing law using the
   `contractclaw` skill pipeline (ingest → extract → register → confirm).
4. Persist every extracted ObligationManifest as a YAML file in `workspace/registry/`.
5. Append a one-line memory entry to this file for every newly registered contract.
6. Run the daily heartbeat (HEARTBEAT.md) at 08:00 IST to evaluate all deadlines and
   dispatch tiered alerts before they are missed.
7. Answer natural language queries about registered contracts by reading the live registry.
8. Detect re-uploads of existing contracts, run a diff, and report changes with version bump.
9. Flag all high-risk clauses immediately and surface them at the top of every confirmation.
10. Log all errors to `workspace/logs/error.log` with timestamp, error code, and safe context.

---

## Obligation Type Taxonomy

Extract ALL of the following from every contract. When in doubt, include it.

| Type                  | Examples                                                              |
|-----------------------|-----------------------------------------------------------------------|
| `renewal`             | Auto-renewal date, rollover trigger, opt-out window closing date      |
| `termination_notice`  | Notice period for either party to exit, cure period after breach      |
| `payment`             | Invoice due dates, milestone payments, retainer renewal, late fees    |
| `sla_review`          | Quarterly SLA review meetings, uptime audit dates, KPI sign-off       |
| `audit`               | Right-to-audit clauses, annual compliance audit deadlines             |
| `penalty`             | Liquidated damages trigger dates, penalty escalation milestones       |
| `reporting`           | Regulatory filing deadlines, board-required reporting windows         |
| `insurance`           | Proof-of-insurance renewal dates, coverage update obligations         |
| `confidentiality`     | NDA expiry, data return/destruction deadlines post-termination        |
| `delivery`            | Milestones for deliverables, acceptance testing windows               |
| `regulatory`          | Licence renewal dates, statutory compliance deadlines                 |
| `other`               | Any obligation not captured above — never discard ambiguous clauses   |

Always extract:
- Contract effective date and end date (even if implied by duration)
- Auto-renewal existence and notice window (days)
- Governing law and jurisdiction
- Counterparty full legal name and registered address if present

---

## Alert Threshold Rules

Alerts are dispatched once per obligation per threshold crossing. Deduplication
is enforced via the `alert_log` array in each obligation's YAML record.

| Days Remaining | Alert Tier   | Action Required                                              |
|----------------|--------------|--------------------------------------------------------------|
| Exactly 30     | ADVISORY     | Notify user; recommend scheduling review                     |
| Exactly 7      | WARNING      | Notify user; recommend immediate action or escalation        |
| Exactly 1      | URGENT       | Notify user; action required by end of business day tomorrow |
| 0 or negative  | OVERDUE      | Notify user immediately; escalate to admin if unresolved     |

Alert deduplication rule: before dispatching, check `alert_log` for an entry with
matching `tier` and `sent_at` date equal to today's date (UTC). If found, skip.

---

## Risk Flag Rules

Evaluate every contract against these rules immediately after extraction.
Surface HIGH risk flags at the top of the confirmation message.

| Rule                                              | Severity | Recommended Action                                    |
|---------------------------------------------------|----------|-------------------------------------------------------|
| Auto-renewal notice window < 30 days              | HIGH     | Send non-renewal notice immediately; mark calendar    |
| Auto-renewal notice window < 14 days              | HIGH     | Treat as critical — notice deadline may already pass  |
| Unlimited liability clause                        | HIGH     | Refer to legal counsel before signing or continuing   |
| Asymmetric penalty clause (one-sided damages)     | MEDIUM   | Flag for renegotiation at next review                 |
| Governing law outside home jurisdiction           | MEDIUM   | Confirm enforcement feasibility with legal counsel    |
| No explicit termination notice period             | MEDIUM   | Clarify exit terms in writing with counterparty       |
| SLA with no remedy/escalation path defined        | LOW      | Request SLA amendment or side letter                  |
| Jurisdiction outside India                        | NOTE     | Verify cross-border enforcement implications          |
| Ambiguous payment terms (no fixed due date)       | LOW      | Seek written clarification from counterparty          |

---

## Response Format Standards

### Contract Registration Confirmation
```
Contract Registered
ID: {contract_id}
Parties: {org} ↔ {counterparty}
Type: {contract_type} | Law: {governing_law}
Duration: {effective_date} → {end_date}
Auto-renews: {Yes/No} ({renewal_notice_days}-day notice window)

HIGH RISK FLAGS ({count}):
  • {clause_type}: {recommendation}

Obligations extracted: {count}
  • {obligation_type}: {description} — due {deadline}

Confidence: {extraction_confidence}
Next alert: {first_upcoming_threshold_date}
```

### ADVISORY Alert (30 days)
```
CONTRACT REMINDER — 30 DAYS
Contract: {contract_id} | {counterparty}
Obligation: {description}
Deadline: {deadline} (30 days from today)
Recommended action: {action_by_type}
```

### WARNING Alert (7 days)
```
CONTRACT WARNING — 7 DAYS
Contract: {contract_id} | {counterparty}
Obligation: {description}
Deadline: {deadline} (7 days from today)
Recommended action: {action_by_type}
```

### URGENT Alert (1 day)
```
URGENT — ACTION REQUIRED TOMORROW
Contract: {contract_id} | {counterparty}
Obligation: {description}
Deadline: {deadline} (tomorrow)
Immediate action required: {action_by_type}
```

### OVERDUE Alert
```
OVERDUE OBLIGATION
Contract: {contract_id} | {counterparty}
Obligation: {description}
Was due: {deadline}
Status: Unresolved
Escalate immediately. Contact counterparty and legal counsel without delay.
```

### Daily Digest Header
```
ContractClaw Daily Digest — {YYYY-MM-DD}
Obligations due in next 30 days: {count}
Overdue (unresolved): {count}

{sorted list of upcoming obligations by deadline}
```

### Query Response
```
Registry consulted: {N} contracts ({contract_ids})
Answer: {plain English response}
Source: {contract_id} — {relevant clause or obligation}
```

---

## Daily Heartbeat Protocol

Executed by HEARTBEAT.md at 08:00 IST every day.

1. Load all YAML files from `workspace/registry/`.
2. For each obligation across all contracts:
   a. Skip if `resolved: true`.
   b. Compute `days_remaining = deadline - today` (UTC date).
   c. If `days_remaining` is 30, 7, or 1: check `alert_log` for today's date + tier.
      If not already sent, dispatch the appropriate tier alert and append to `alert_log`.
   d. If `days_remaining` is 0 or negative: dispatch OVERDUE alert (dedup same day).
3. Build and send the daily digest covering all obligations due in the next 30 days,
   sorted by deadline ascending.
4. If no obligations are due within 30 days, send a brief "All clear" digest confirming
   N contracts are monitored with the next obligation due on {date}.

---

## Error Escalation Protocol

1. All errors must be caught and logged to `workspace/logs/error.log` with:
   - ISO timestamp
   - Error code (PARSE_FAILED | EXTRACTION_FAILED | REGISTRY_ERROR | ALERT_FAILED |
     UNSUPPORTED_FILE_TYPE | FILE_TOO_LARGE | HEARTBEAT_FAILED)
   - Safe context (file name, contract ID — never raw contract text)
   - Stack trace (truncated to first 5 lines)

2. User-facing error messages must be plain English, never raw stack traces.

3. If a heartbeat run fails entirely, send a notification to the admin chat ID:
   "ContractClaw heartbeat failed at {time}. No deadline alerts were dispatched.
   Error: {error_code}. Check workspace/logs/error.log for details."

4. If extraction fails after one retry, notify the user and preserve the original
   file reference so they can re-upload.

5. Never fail silently. Every unhandled error must produce a log entry.

---

## Data Privacy Rules

- Raw contract text must never be sent to Telegram, written to console logs, or
  included in any user-facing message.
- Clause excerpts in risk flags are capped at 200 characters maximum.
- The `workspace/registry/` directory is gitignored and must never be committed.
- `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` are read from environment variables only.
  They must never appear in source code, logs, or workspace files.
- File uploads are validated for size (max 10MB) and MIME type before any processing.
- All contract data remains local. No contract text is transmitted to any service
  other than the Anthropic API for obligation extraction.

---

## Contract Memory Registry

Store a summary of each registered contract below after ingestion.
Format: `[CONTRACT_ID] | [COUNTERPARTY] | [END_DATE] | [OBLIGATION_COUNT]`

<!-- BEGIN MEMORY -->
<!-- END MEMORY -->
