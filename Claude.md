# CLAUDE.md — ContractClaw: Intelligent Contract Obligation Monitoring Agent

## Project Overview

You are building **ContractClaw**, an always-on AI agent that autonomously monitors business contracts for obligations, deadlines, and renewal windows. It is built entirely on the **OpenClaw** framework (https://github.com/openclaw/openclaw), using the Anthropic Claude API as the inference backend.

Users upload contracts (PDF or DOCX) via Telegram. The agent extracts all obligations, persists them in a YAML registry, and proactively sends tiered alerts before critical deadlines are missed — all without any human intervention.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | OpenClaw (latest, Node 24+) |
| LLM Backend | Anthropic Claude (`claude-sonnet-4-20250514`) via `anthropic/claude-sonnet-4-20250514` |
| Primary Channel | Telegram Bot |
| Document Parsing | `pdf-parse` (PDF), `mammoth` (DOCX) |
| Obligation Registry | YAML files in OpenClaw workspace |
| Scheduling | OpenClaw HEARTBEAT.md daemon |
| Runtime | Node.js 24+ / TypeScript |
| Containerisation | Docker Compose |

---

## Repository Structure

Build the following directory layout from scratch:

```
contractclaw/
├── CLAUDE.md                    # This file (project context for Claude Code)
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── .env.example
├── README.md
│
├── workspace/                   # OpenClaw agent workspace (agents.defaults.workspace)
│   ├── SOUL.md                  # Agent persona, tone, boundaries
│   ├── AGENTS.md                # Operating instructions + persistent memory
│   ├── IDENTITY.md              # Agent name, emoji, vibe
│   ├── USER.md                  # Default user profile template
│   ├── HEARTBEAT.md             # Daily deadline scheduler instructions
│   ├── SKILLS.md                # Skill loader manifest
│   │
│   ├── skills/
│   │   └── contractclaw/
│   │       ├── SKILL.md         # Main skill definition (PRIMARY DELIVERABLE)
│   │       ├── ingest.ts        # Document ingestion + text extraction
│   │       ├── extract.ts       # LLM obligation extraction via Claude API
│   │       ├── registry.ts      # YAML obligation registry read/write
│   │       ├── alert.ts         # Tiered alert formatting + Telegram dispatch
│   │       ├── diff.ts          # Contract version diffing
│   │       ├── query.ts         # Natural language query handler
│   │       └── risk.ts          # Clause risk flagging logic
│   │
│   └── registry/                # Persisted YAML obligation files (gitignored)
│       └── .gitkeep
│
├── openclaw.json                # OpenClaw gateway configuration
└── src/
    └── types/
        ├── obligation.ts        # TypeScript types for obligation schema
        └── registry.ts          # Registry schema types
```

---

## Step-by-Step Build Instructions

### Phase 1: OpenClaw Setup

1. Install OpenClaw globally:
   ```bash
   npm install -g openclaw@latest
   ```

2. Initialise workspace:
   ```bash
   openclaw setup
   ```
   Point `agents.defaults.workspace` to `./workspace` in `openclaw.json`.

3. Configure `openclaw.json` with:
   - `agents.defaults.model`: `anthropic/claude-sonnet-4-20250514`
   - `agents.defaults.workspace`: `./workspace`
   - `channels.telegram.token`: from `.env`
   - `channels.telegram.allowFrom`: list of authorised chat IDs

### Phase 2: Workspace Bootstrap Files

Write the following files in `workspace/`:

#### `SOUL.md`
```markdown
# ContractClaw Persona

You are ContractClaw, a precise and vigilant contract intelligence agent.
Your role is to protect organisations from missed deadlines, silent auto-renewals,
and overlooked obligations buried in legal documents.

Tone: professional, concise, and action-oriented.
Never speculate about legal outcomes. Always recommend consulting a lawyer for disputes.
When extracting obligations, be exhaustive — err on the side of flagging more, not less.
When sending alerts, include the contract name, counterparty, deadline type, days remaining,
and a clear recommended action.
```

#### `AGENTS.md`
```markdown
# ContractClaw Operating Instructions

## Core Responsibilities
1. Accept contract files (PDF, DOCX) from the user via Telegram.
2. Extract all obligations, parties, dates, and risk clauses using the contractclaw skill.
3. Persist extracted obligations into the YAML registry at workspace/registry/.
4. Run daily via HEARTBEAT.md to evaluate upcoming deadlines and dispatch tiered alerts.
5. Answer natural language queries about registered contracts.

## Obligation Types to Always Extract
- Contract start and end dates
- Auto-renewal clauses (with notice window)
- Termination notice periods
- Payment milestones and schedules
- SLA review dates
- Audit obligations
- Penalty and liability clauses
- Governing law and jurisdiction

## Alert Thresholds (configurable in openclaw.json)
- 30 days before deadline: ADVISORY alert
- 7 days before deadline: WARNING alert
- 1 day before deadline: URGENT alert

## Risk Flags
- Auto-renewal notice window < 30 days → HIGH RISK
- Asymmetric penalty clauses → MEDIUM RISK
- Unlimited liability clauses → HIGH RISK
- Jurisdiction outside India → NOTE

## Memory
- Store a summary of each registered contract in this file after ingestion.
- Format: `[CONTRACT_ID] | [COUNTERPARTY] | [END_DATE] | [OBLIGATION_COUNT]`
```

#### `HEARTBEAT.md`
```markdown
# Daily Deadline Heartbeat

Run this check every day at 08:00 IST.

1. Read all YAML files in workspace/registry/.
2. For each obligation in each contract:
   a. Compute days until deadline from today's date.
   b. If days_remaining is exactly 30, 7, or 1 — dispatch the appropriate alert tier.
   c. If days_remaining is 0 or negative and obligation is not marked `resolved: true` — dispatch an OVERDUE alert.
3. Send a daily digest summary to the Telegram channel listing all obligations due in the next 30 days.
4. Do not send duplicate alerts for the same obligation on the same day (check alert_log in YAML).

Use the `contractclaw/alert` skill for all dispatches.
```

#### `IDENTITY.md`
```markdown
name: ContractClaw
emoji: 🦞
tagline: "Your vigilant contract sentinel. Never miss a deadline."
```

---

### Phase 3: Core Skill — `workspace/skills/contractclaw/SKILL.md`

This is the **primary technical deliverable**. Write it with the following sections:

```markdown
# ContractClaw Skill

## Purpose
Provides contract ingestion, obligation extraction, YAML registry management,
tiered alerting, risk flagging, contract diffing, and natural language query
handling for the ContractClaw agent.

## Trigger Phrases
- User sends a PDF or DOCX file attachment
- "upload contract", "add contract", "register contract"
- "which contracts renew", "what deadlines", "show obligations"
- "check contracts", "upcoming renewals", "contract status"

## Pipeline

### 1. Ingest (ingest.ts)
- Accept file from Telegram (PDF or DOCX)
- Extract raw text using pdf-parse (PDF) or mammoth (DOCX)
- Validate: reject files > 10MB or non-text-extractable scans (notify user)
- Return: { rawText: string, fileName: string, fileType: 'pdf'|'docx' }

### 2. Extract (extract.ts)
- Call Claude API with the extraction prompt template (see below)
- Parse response JSON into ObligationManifest
- Validate all required fields; prompt user to confirm if confidence < 0.8
- Return: ObligationManifest

### 3. Register (registry.ts)
- Generate contract ID: slug of counterparty name + date (e.g., acme-corp-2025-06)
- Serialise ObligationManifest to YAML
- Write to workspace/registry/<contract_id>.yaml
- Append summary line to AGENTS.md memory section
- Return: contractId

### 4. Confirm (alert.ts)
- Send structured Telegram reply:
  - ✅ Contract registered: <contractId>
  - Parties: <org> ↔ <counterparty>
  - Duration: <start> → <end>
  - Obligations extracted: <count>
  - Risk flags: <count> (list each)
  - Next alert: <date of first upcoming threshold>

### 5. Query (query.ts)
- Load all YAML files from workspace/registry/
- Pass user question + registry summary to Claude API
- Return structured answer

## Extraction Prompt Template

Use this exact system prompt when calling Claude for obligation extraction:

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

## Alert Templates

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
[same fields]
```

### URGENT (1 day)
```
🚨 URGENT — ACTION REQUIRED TOMORROW
[same fields]
```

### OVERDUE
```
❌ OVERDUE OBLIGATION
Contract: {contract_id}
Obligation: {obligation.description}
Was due: {obligation.deadline}
Action required immediately.
```
```

---

### Phase 4: TypeScript Implementation Files

Implement each `.ts` file in `workspace/skills/contractclaw/`. All files use ES modules and TypeScript strict mode.

#### `ingest.ts` — Document parsing
- Use `pdf-parse` for PDFs, `mammoth` for DOCX
- Export: `async function ingestDocument(filePath: string): Promise<{ rawText: string; fileName: string; fileType: string }>`
- Handle errors gracefully with descriptive messages back to user

#### `extract.ts` — LLM extraction
- Call `https://api.anthropic.com/v1/messages` with `claude-sonnet-4-20250514`
- Use the extraction prompt from SKILL.md
- Export: `async function extractObligations(rawText: string, fileName: string): Promise<ObligationManifest>`
- Parse and validate JSON response; throw descriptive errors on malformed output

#### `registry.ts` — YAML persistence
- Use `js-yaml` for serialisation
- Registry directory: `workspace/registry/`
- Export: 
  - `async function saveContract(manifest: ObligationManifest): Promise<string>` (returns contractId)
  - `async function loadAllContracts(): Promise<ObligationManifest[]>`
  - `async function loadContract(contractId: string): Promise<ObligationManifest>`
  - `async function updateObligation(contractId: string, obligationId: string, updates: Partial<Obligation>): Promise<void>`

#### `alert.ts` — Alert formatting
- Export: `function formatAlert(tier: 'ADVISORY'|'WARNING'|'URGENT'|'OVERDUE', manifest: ObligationManifest, obligation: Obligation): string`
- Export: `function formatConfirmation(manifest: ObligationManifest): string`
- Export: `function formatDailyDigest(upcomingObligations: UpcomingObligation[]): string`

#### `diff.ts` — Contract diffing
- Compare two ObligationManifest objects
- Export: `function diffContracts(oldManifest: ObligationManifest, newManifest: ObligationManifest): ContractDiff`
- Report: added obligations, removed obligations, changed deadlines, new risk flags

#### `query.ts` — Natural language queries
- Load all contracts from registry
- Build a compact registry summary (contract IDs, counterparties, end dates, obligation counts)
- Call Claude API with user query + summary as context
- Export: `async function queryRegistry(userQuestion: string): Promise<string>`

#### `risk.ts` — Risk flag analysis
- Export: `function analyseRisk(manifest: ObligationManifest): RiskSummary`
- Apply rules from AGENTS.md risk section
- Return prioritised list of risks with recommended actions

---

### Phase 5: OpenClaw Configuration (`openclaw.json`)

```json
{
  "agents": {
    "defaults": {
      "workspace": "./workspace",
      "model": "anthropic/claude-sonnet-4-20250514",
      "heartbeat": {
        "enabled": true,
        "cron": "0 8 * * *",
        "timezone": "Asia/Kolkata"
      }
    }
  },
  "channels": {
    "telegram": {
      "token": "${TELEGRAM_BOT_TOKEN}",
      "allowFrom": ["${TELEGRAM_CHAT_ID}"]
    }
  },
  "skills": {
    "load": {
      "extraDirs": ["./workspace/skills"]
    }
  }
}
```

---

### Phase 6: Environment Variables (`.env.example`)

```env
# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here

# Optional: Alert recipients (comma-separated chat IDs)
ALERT_RECIPIENTS=chat_id_1,chat_id_2

# OpenClaw
OPENCLAW_WORKSPACE=./workspace
```

---

### Phase 7: Docker Compose (`docker-compose.yml`)

```yaml
version: '3.9'
services:
  contractclaw:
    image: node:24-alpine
    working_dir: /app
    volumes:
      - .:/app
      - ./workspace/registry:/app/workspace/registry
    env_file:
      - .env
    command: sh -c "npm install -g openclaw@latest && openclaw start"
    restart: unless-stopped
```

---

## TypeScript Types (`src/types/obligation.ts`)

```typescript
export interface Obligation {
  id: string;
  type: 'renewal' | 'termination_notice' | 'payment' | 'sla_review' | 'audit' | 'penalty' | 'other';
  description: string;
  deadline: string | null;         // ISO date YYYY-MM-DD
  recurring: boolean;
  recurrence_pattern: 'monthly' | 'quarterly' | 'annually' | null;
  party_responsible: 'org' | 'counterparty' | 'both';
  resolved: boolean;
  alert_log: AlertLogEntry[];
}

export interface AlertLogEntry {
  tier: 'ADVISORY' | 'WARNING' | 'URGENT' | 'OVERDUE';
  sent_at: string;                 // ISO datetime
}

export interface RiskFlag {
  clause_type: string;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  clause_excerpt: string;
  recommendation: string;
}

export interface ObligationManifest {
  contract_id: string;
  parties: {
    org: string;
    counterparty: string;
  };
  contract_type: string;
  governing_law: string;
  dates: {
    effective_date: string | null;
    end_date: string | null;
    auto_renews: boolean;
    renewal_notice_days: number | null;
  };
  obligations: Obligation[];
  risk_flags: RiskFlag[];
  extraction_confidence: number;
  raw_text_length: number;
  registered_at: string;           // ISO datetime
  source_filename: string;
  version: number;                 // increments on re-upload
}

export interface UpcomingObligation {
  contractId: string;
  counterparty: string;
  obligation: Obligation;
  daysRemaining: number;
  alertTier: 'ADVISORY' | 'WARNING' | 'URGENT' | 'OVERDUE';
}

export interface ContractDiff {
  contractId: string;
  addedObligations: Obligation[];
  removedObligations: Obligation[];
  changedDeadlines: { id: string; oldDeadline: string | null; newDeadline: string | null }[];
  newRiskFlags: RiskFlag[];
  resolvedRiskFlags: RiskFlag[];
}
```

---

## Claude API Usage Guidelines

- Model: always use `claude-sonnet-4-20250514`
- Max tokens: 4096 for extraction, 1024 for queries and alerts
- Temperature: 0 for extraction (deterministic), 0.3 for NL query responses
- Always include `"type": "text"` check when parsing `data.content` blocks
- Wrap all API calls in try/catch; return user-friendly Telegram error messages on failure
- For extraction: if JSON parse fails, retry once with a stricter "return only JSON, no other text" instruction appended
- Never log raw contract text to console in production (data privacy)

---

## Error Handling Conventions

- All skill functions must return either a result or throw a typed `ContractClawError`
- Define error codes: `PARSE_FAILED`, `EXTRACTION_FAILED`, `REGISTRY_ERROR`, `ALERT_FAILED`, `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`
- Send user-facing error messages to Telegram in plain English, never raw stack traces
- Log errors to `workspace/logs/error.log` with timestamp, error code, and safe context

---

## Security Requirements

- Never store or log raw contract text outside of the workspace directory
- The workspace/registry directory must be `.gitignore`d
- `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` must only be read from environment variables, never hardcoded
- File uploads must be validated: max 10MB, only PDF/DOCX MIME types accepted
- `allowFrom` in `openclaw.json` must be set to prevent unauthorised Telegram access

---

## Testing Checklist

Before marking a phase complete, verify:

- [ ] PDF upload → obligation extraction → YAML saved correctly
- [ ] DOCX upload → obligation extraction → YAML saved correctly
- [ ] HEARTBEAT.md fires and produces correct alerts for a contract with a deadline 30/7/1 days away
- [ ] Natural language query returns accurate results from registry
- [ ] Re-upload of amended contract produces a diff report
- [ ] Risk flags are correctly identified for auto-renewal with short notice window
- [ ] Overdue obligation triggers OVERDUE alert (not just standard tiers)
- [ ] File > 10MB is rejected with a clear Telegram message
- [ ] Non-PDF/DOCX file is rejected with a clear Telegram message
- [ ] `docker-compose up` starts the agent successfully

---

## Definition of Done

The project is complete when a user can:

1. Send a PDF vendor contract to the ContractClaw Telegram bot
2. Receive back a structured obligation summary within 60 seconds
3. Receive a Telegram alert exactly at the 30-day threshold before any obligation deadline
4. Ask "Which contracts renew in the next 60 days?" and receive an accurate list
5. Re-upload an amended contract and receive a clear diff of what changed
6. See high-risk clauses (e.g. auto-renewal with 14-day notice window) flagged in the upload confirmation

All contract data must remain local. No contract text is transmitted to any service other than the Anthropic API for extraction.