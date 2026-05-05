# ContractClaw Skill

## Purpose

ContractClaw is an always-on contract intelligence skill. When invoked, it accepts contract
documents (PDF or DOCX) from users via Telegram, runs them through a structured pipeline —
ingest, LLM extraction, YAML persistence, risk evaluation, and confirmation — and thereafter
answers natural-language queries about the registered contract portfolio. It also drives the
daily HEARTBEAT check that dispatches tiered deadline alerts. Every operation has a defined
success path and a defined error path; nothing is left to the agent's improvisation.

---

## Triggers

The agent MUST invoke this skill when ANY of the following conditions are true:

| Condition | Type |
|---|---|
| User sends a message with a file attachment (`.pdf` or `.docx`) | File upload |
| Message text contains "upload contract" | NL command |
| Message text contains "add contract" | NL command |
| Message text contains "register contract" | NL command |
| Message text contains "show contracts" or "list contracts" | NL query |
| Message text contains "which contracts renew" | NL query |
| Message text contains "upcoming renewals" | NL query |
| Message text contains "what deadlines" | NL query |
| Message text contains "show obligations" | NL query |
| Message text contains "check contracts" | NL query |
| Message text contains "contract status" | NL query |
| Message text is exactly "help" | Help command |
| HEARTBEAT.md daemon fires (daily cron, 08:00 IST) | Scheduled check |

Matching is case-insensitive. If the message contains both a file and a text command,
treat it as a file upload and ignore the text command.

---

## File Upload Pipeline

When a file attachment is received, execute the following steps in strict order.
Do NOT skip steps. Do NOT proceed past a step if it throws.

### Step 1 — Download the file

Obtain the local file path from the Telegram file download. Store it as `downloadedFilePath`.
Also capture `chatId` (the Telegram chat ID to reply to).

### Step 2 — Run the pipeline

```typescript
import { processContract } from './pipeline.js';

try {
  const result = await processContract(downloadedFilePath, chatId);
  // result: { contractId: string; manifest: ObligationManifest; confirmationMessage: string }
} catch (err) {
  // See: Error Handling section below
}
```

`processContract` internally calls, in order:
1. `ingestDocument(downloadedFilePath)` — from `ingest.ts`
2. `extractObligations(rawText, fileName)` — from `extract.ts`
3. Confidence check (see below) — inline in pipeline
4. `saveContract(manifest)` — from `registry.ts`
5. `formatConfirmation(manifest)` — from `alert.ts`
6. Appends summary line to `workspace/AGENTS.md` memory section

### Step 3 — Confidence check (BEFORE saving)

`processContract` performs this check internally, but the agent must honour the pause:

```typescript
if (manifest.extraction_confidence < 0.8) {
  // DO NOT call saveContract yet.
  // Send the user a preview of extracted obligations and ask for confirmation:
  await sendTelegramMessage(chatId,
    `⚠️ Low confidence extraction (${(manifest.extraction_confidence * 100).toFixed(0)}%).\n\n` +
    `I found ${manifest.obligations.length} obligation(s) and ` +
    `${manifest.risk_flags.length} risk flag(s) for contract with ` +
    `${manifest.parties.counterparty}.\n\n` +
    `Reply *yes* to save, or *no* to discard.`
  );
  // Await user confirmation (next message in chat).
  // If user replies "yes" → call saveContract(manifest).
  // If user replies "no" → discard, send: "Contract discarded. You can re-upload at any time."
  // If no reply within 5 minutes → discard silently.
}
```

If `extraction_confidence >= 0.8`, save immediately without asking.

### Step 4 — Send confirmation

After a successful save, send `result.confirmationMessage` verbatim to the user via Telegram.
`formatConfirmation` produces a message in this exact format:

```
✅ Contract registered: {contractId}
Parties: {org} ↔ {counterparty}
Type: {contract_type}
Duration: {effective_date} → {end_date}
Auto-renews: {yes/no} (notice window: {renewal_notice_days} days)
Obligations extracted: {count}
Risk flags: {count}
{risk_flag_line_per_flag: "  • [LEVEL] clause_type — recommendation"}
Next alert: {ISO date of nearest upcoming alert threshold}
```

---

## Query Pipeline

When the trigger is a natural-language question (no file attachment), execute:

```typescript
import { queryRegistry } from './query.js';

const answer = await queryRegistry(userMessage);
await sendTelegramMessage(chatId, answer);
```

`queryRegistry` loads all YAML files from `workspace/registry/`, builds a compact summary,
and calls the Claude API (`claude-sonnet-4-20250514`, temperature 0.3, max_tokens 1024)
with the user question and registry summary as context. It returns a plain-text answer
ready to send.

If the registry is empty (no YAML files found), send:

```
No contracts are registered yet. Send me a PDF or DOCX contract to get started.
```

---

## HEARTBEAT Pipeline

When invoked by the daily cron daemon (HEARTBEAT.md), execute:

```typescript
import { loadAllContracts } from './registry.js';
import { formatAlert, formatDailyDigest } from './alert.js';

const manifests = await loadAllContracts();
const upcomingObligations: UpcomingObligation[] = [];

for (const manifest of manifests) {
  for (const obligation of manifest.obligations) {
    if (obligation.resolved) continue;
    const daysRemaining = daysUntil(obligation.deadline); // compute from today's date

    // Dispatch tiered alert only on exact threshold days, and only if not already sent today
    const alreadySentToday = obligation.alert_log.some(
      entry => entry.tier === tierFor(daysRemaining) && isToday(entry.sent_at)
    );

    if (!alreadySentToday) {
      if (daysRemaining === 30) sendAlert('ADVISORY', manifest, obligation);
      if (daysRemaining === 7)  sendAlert('WARNING',  manifest, obligation);
      if (daysRemaining === 1)  sendAlert('URGENT',   manifest, obligation);
      if (daysRemaining <= 0)   sendAlert('OVERDUE',  manifest, obligation);
    }

    if (daysRemaining >= 0 && daysRemaining <= 30) {
      upcomingObligations.push({ contractId: manifest.contract_id, counterparty: manifest.parties.counterparty, obligation, daysRemaining, alertTier: tierFor(daysRemaining) });
    }
  }
}

// Always send the daily digest, even if no individual alerts fired
const digest = formatDailyDigest(upcomingObligations);
await sendTelegramMessage(PRIMARY_CHAT_ID, digest);
```

After dispatching each alert, append an `AlertLogEntry` to the obligation's `alert_log`
array and call `updateObligation(contractId, obligation.id, { alert_log: updatedLog })`.

---

## Error Handling

Catch all errors thrown by pipeline functions. Inspect `err.code` to determine the
user-facing response. NEVER send raw stack traces or error objects to Telegram.

| Error Code | Telegram message to send |
|---|---|
| `FILE_TOO_LARGE` | "File exceeds the 10 MB limit. Please compress your document and try again." |
| `UNSUPPORTED_FILE_TYPE` | "Only PDF (.pdf) and DOCX (.docx) files are supported. Please convert your document and re-upload." |
| `PARSE_FAILED` | "Could not extract text from your document. It may be a scanned image PDF. Please upload a text-based PDF or DOCX." |
| `EXTRACTION_FAILED` | "AI extraction failed after two attempts. This can happen with heavily formatted or encrypted contracts. Please try again or contact support." |
| `REGISTRY_ERROR` | "There was a problem saving your contract to the registry. Please try again. If the issue persists, check workspace/logs/error.log." |
| `ALERT_FAILED` | "An alert could not be dispatched. The obligation is still tracked — alerts will retry on the next HEARTBEAT run." |
| Unknown / untyped | "An unexpected error occurred. Please try again. If it keeps happening, check workspace/logs/error.log for details." |

All errors must also be written to `workspace/logs/error.log` in this format:

```
[YYYY-MM-DDTHH:mm:ssZ] [ERROR_CODE] context: <safe description, no raw contract text>
```

---

## Supported Commands

| User Input | Action |
|---|---|
| Send PDF or DOCX file | `processContract(filePath, chatId)` |
| "upload contract" / "add contract" / "register contract" | Prompt user: "Please attach the PDF or DOCX contract file." |
| "show contracts" / "list contracts" | `queryRegistry("List all registered contracts with their counterparty, end date, and obligation count.")` |
| "upcoming renewals" | `queryRegistry("Which contracts have upcoming renewal or termination notice deadlines in the next 60 days?")` |
| "what deadlines" / "show obligations" | `queryRegistry("List all obligations due in the next 30 days across all contracts.")` |
| "check contracts" / "contract status" | `queryRegistry("Summarise the status of all contracts, including any overdue or high-risk obligations.")` |
| "which contracts renew" | `queryRegistry("Which contracts have auto-renewal clauses and what are their notice window deadlines?")` |
| "help" | Send the help message (see Help Message section below) |

---

## Help Message

When the user sends "help", send exactly:

```
ContractClaw — Command Reference

Upload a contract:
  Send any PDF or DOCX file

Query your portfolio:
  "list contracts"         — all registered contracts
  "upcoming renewals"      — renewal deadlines in the next 60 days
  "what deadlines"         — obligations due in the next 30 days
  "contract status"        — full portfolio status summary
  "which contracts renew"  — auto-renewal clause summary

Other:
  "help"                   — this message

Alerts are sent automatically at 30, 7, and 1 day before each deadline.
All contract data is stored locally. Nothing is shared except with the Anthropic API for extraction.
```

---

## Extraction Prompt Template

Use this exact system prompt when calling the Claude API for obligation extraction.
Model: `claude-sonnet-4-20250514`. Temperature: `0`. Max tokens: `4096`.
If the JSON parse fails on the first attempt, retry exactly once with this suffix appended
to the user message: `\n\nReturn ONLY the JSON object. No markdown, no backticks, no explanation.`

```
You are a contract analysis engine. Extract ALL obligations from the contract text provided.
Return ONLY valid JSON. No preamble. No markdown. No explanation.

Output schema:
{
  "contract_id": "<slug>",
  "parties": {
    "org": "<organisation name>",
    "counterparty": "<other party name>"
  },
  "contract_type": "<service|employment|lease|license|vendor|other>",
  "governing_law": "<jurisdiction>",
  "dates": {
    "effective_date": "YYYY-MM-DD or null",
    "end_date": "YYYY-MM-DD or null",
    "auto_renews": true|false,
    "renewal_notice_days": <number or null>
  },
  "obligations": [
    {
      "id": "<unique short id>",
      "type": "<renewal|termination_notice|payment|sla_review|audit|penalty|other>",
      "description": "<plain English description>",
      "deadline": "YYYY-MM-DD or null",
      "recurring": true|false,
      "recurrence_pattern": "<monthly|quarterly|annually|null>",
      "party_responsible": "<org|counterparty|both>",
      "resolved": false,
      "alert_log": []
    }
  ],
  "risk_flags": [
    {
      "clause_type": "<auto_renewal|asymmetric_penalty|unlimited_liability|short_notice|other>",
      "risk_level": "<HIGH|MEDIUM|LOW>",
      "clause_excerpt": "<relevant text excerpt, max 200 chars>",
      "recommendation": "<brief action>"
    }
  ],
  "extraction_confidence": <0.0 to 1.0>,
  "raw_text_length": <number>
}
```

---

## Risk Evaluation Rules

After extraction, `analyseRisk(manifest)` from `risk.ts` applies these rules programmatically
in addition to whatever the LLM returned in `risk_flags`. If a rule fires and an equivalent
flag is not already present, append a new `RiskFlag` to `manifest.risk_flags` before saving.

| Rule | Condition | Risk Level | Recommendation |
|---|---|---|---|
| Short auto-renewal window | `dates.auto_renews === true && dates.renewal_notice_days !== null && dates.renewal_notice_days < 30` | HIGH | "Set a calendar reminder to review renewal intent at least 30 days before the notice deadline." |
| Asymmetric penalty clause | Any obligation of type `penalty` where `party_responsible` is `org` but no corresponding counterparty penalty exists | MEDIUM | "Negotiate a reciprocal penalty clause or cap liability exposure." |
| Unlimited liability | Any `risk_flag` with `clause_type === 'unlimited_liability'` already returned by LLM | HIGH | "Seek legal advice to introduce a liability cap before signing or renewing." |
| Non-India jurisdiction | `governing_law` does not contain "India" (case-insensitive) | NOTE (LOW) | "Confirm your legal team is equipped to handle disputes under this jurisdiction." |

Rules are applied in the order listed. All triggered rules are included in the confirmation
message sent to the user.

---

## Alert Templates

Use these exact templates in `formatAlert()`. Substitute all `{placeholders}` at call time.
Do not add, remove, or reorder fields.

### ADVISORY (30 days)

```
📋 CONTRACT REMINDER — 30 days
Contract: {contract_id}
Counterparty: {counterparty}
Obligation: {obligation.description}
Deadline: {obligation.deadline}
Days remaining: 30
Action: {recommended_action_by_type}
```

### WARNING (7 days)

```
⚠️ CONTRACT WARNING — 7 days
Contract: {contract_id}
Counterparty: {counterparty}
Obligation: {obligation.description}
Deadline: {obligation.deadline}
Days remaining: 7
Action: {recommended_action_by_type}
```

### URGENT (1 day)

```
🚨 URGENT — ACTION REQUIRED TOMORROW
Contract: {contract_id}
Counterparty: {counterparty}
Obligation: {obligation.description}
Deadline: {obligation.deadline}
Days remaining: 1
Action: {recommended_action_by_type}
```

### OVERDUE

```
❌ OVERDUE OBLIGATION
Contract: {contract_id}
Counterparty: {counterparty}
Obligation: {obligation.description}
Was due: {obligation.deadline}
Action required immediately.
```

`recommended_action_by_type` mapping (use in ADVISORY, WARNING, and URGENT templates):

| Obligation type | Recommended action text |
|---|---|
| `renewal` | "Decide whether to renew or terminate before the notice deadline." |
| `termination_notice` | "Serve formal written notice of termination if you intend to exit." |
| `payment` | "Initiate the payment or invoice process immediately." |
| `sla_review` | "Schedule an SLA review meeting with the counterparty." |
| `audit` | "Prepare audit documentation and schedule the audit session." |
| `penalty` | "Review compliance status to avoid triggering the penalty clause." |
| `other` | "Review the obligation and take required action before the deadline." |

---

## Invariants — Never Violate These

1. Raw contract text MUST NOT be logged to console or written outside `workspace/`.
2. `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` MUST be read from environment variables only.
3. Files larger than 10 MB MUST be rejected before any parsing is attempted.
4. Only `.pdf` and `.docx` MIME types are accepted. All others are rejected immediately.
5. `saveContract` MUST NOT be called if `extraction_confidence < 0.8` and the user has not
   explicitly confirmed with "yes".
6. `alert_log` MUST be updated after every dispatched alert to prevent duplicate sends.
7. All Telegram messages sent to users MUST be plain text or Markdown — never raw JSON or
   TypeScript objects.
