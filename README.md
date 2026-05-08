# 🦞 ContractClaw

### *Your vigilant contract sentinel. Never miss a deadline.*

[![Built with OpenClaw](https://img.shields.io/badge/Built%20with-OpenClaw-blueviolet)](https://github.com/openclaw/openclaw)
[![Model](https://img.shields.io/badge/Model-Claude%20Sonnet%204-blue)](https://anthropic.com)
[![Channel](https://img.shields.io/badge/Channel-Telegram-2CA5E0)](https://telegram.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## What It Does

Businesses lose thousands — sometimes millions — every year to missed contract deadlines: silent auto-renewals that lock in another year of a vendor you wanted to leave, SLA review windows that quietly expire, payment milestones that slip past unnoticed. ContractClaw eliminates that risk entirely.

Upload any vendor, service, or employment contract as a PDF or DOCX directly into Telegram. ContractClaw's AI engine (Claude Sonnet) reads the full document, extracts every single obligation — renewal clauses, termination notice periods, payment schedules, audit requirements, liability caps — and stores them in a private local YAML registry. From that moment on, you receive proactive Telegram alerts at exactly 30 days, 7 days, and 1 day before each deadline, plus an immediate flag the moment anything goes overdue.

No dashboard to log into. No spreadsheet to maintain. No deadline gets missed.

---

## Architecture

```
┌─────────────┐     file upload      ┌───────────────────────────────────────────────────────────┐
│             │ ──────────────────►  │                    OpenClaw Agent Runtime                  │
│  Telegram   │                      │                                                             │
│    User     │                      │  ┌──────────┐   ┌──────────┐   ┌────────────────────────┐  │
│             │ ◄────────────────── │  │ ingest   │──►│ extract  │──►│      registry.ts       │  │
└─────────────┘   alert / confirm    │  │   .ts    │   │   .ts    │   │   (YAML · local disk)  │  │
                                     │  │          │   │          │   └────────────┬───────────┘  │
                                     │  │ pdf-parse│   │  Claude  │                │               │
                                     │  │ mammoth  │   │  Sonnet  │                ▼               │
                                     │  └──────────┘   └──────────┘   ┌────────────────────────┐  │
                                     │                                  │       alert.ts         │  │
                                     │  ┌──────────┐   ┌──────────┐   │  ADVISORY / WARNING /  │  │
                                     │  │ query.ts │   │  risk.ts │   │  URGENT / OVERDUE      │  │
                                     │  │  (NL Q&A)│   │ (flags)  │   └────────────┬───────────┘  │
                                     │  └──────────┘   └──────────┘                │               │
                                     │                                              │               │
                                     │  ┌──────────────────────────────────────┐   │               │
                                     │  │  HEARTBEAT.md  (cron · 08:00 IST)   │───┘               │
                                     │  └──────────────────────────────────────┘                   │
                                     └───────────────────────────────────────────────────────────┘
                                                                │
                                                                ▼
                                                        ┌─────────────┐
                                                        │  Telegram   │
                                                        │    Alert    │
                                                        └─────────────┘
```

**Pipeline summary:**

1. User sends a contract file via Telegram
2. `ingest.ts` extracts raw text (PDF via `pdf-parse`, DOCX via `mammoth`)
3. `extract.ts` calls Claude Sonnet with a strict JSON extraction prompt
4. `registry.ts` serialises the result to YAML in `workspace/registry/`
5. `alert.ts` sends a structured confirmation back to Telegram
6. `HEARTBEAT.md` runs every morning at 08:00 IST, checks all registered deadlines, and dispatches tiered alerts

---

## Features

- 📄 **PDF & DOCX ingestion** — upload any contract directly to Telegram; automatic text extraction with file-size and MIME-type validation (max 10 MB)
- 🤖 **AI-powered obligation extraction** — Claude Sonnet reads the full contract text and returns a structured JSON manifest: parties, dates, every obligation type, and risk clauses — nothing buried in the fine print is skipped
- 📁 **Local YAML registry** — all extracted data lives on your machine in `workspace/registry/`; no contract text is stored in any cloud database
- 🔔 **Tiered proactive alerts** — automatic Telegram notifications at exactly 30 days (Advisory), 7 days (Warning), and 1 day (Urgent) before each deadline; overdue obligations are flagged immediately
- 🔍 **Natural language queries** — ask "which contracts renew next month?" or "what are my payment obligations for CloudVault?" and get a direct answer drawn from the live registry
- 🔄 **Version diffing on re-upload** — upload an amended contract and receive a clear diff report: added obligations, removed obligations, changed deadlines, and new risk flags
- ⚠️ **Risk flag analysis** — auto-renewal windows shorter than 30 days (HIGH), asymmetric penalty clauses (MEDIUM), unlimited liability exposure (HIGH), and out-of-jurisdiction governing law are all surfaced at ingestion time
- 🏃 **Daily heartbeat at 08:00 IST** — OpenClaw's built-in cron daemon evaluates every registered obligation each morning and sends a daily digest of everything due in the next 30 days; duplicate alerts on the same day are suppressed

---

## Quick Start

### Option A — Docker (Recommended)

**Prerequisites:** Docker, a Telegram bot token, and an Anthropic API key.

```bash
# 1. Clone the repository
git clone https://github.com/your-org/contractclaw.git
cd contractclaw

# 2. Copy the environment template
cp .env.example .env

# 3. Fill in your credentials
#    Open .env and set:
#      ANTHROPIC_API_KEY=sk-ant-...
#      TELEGRAM_BOT_TOKEN=123456:ABC-...
#      TELEGRAM_CHAT_ID=your_chat_id

# 4. Install Node dependencies (optional — Docker handles this too)
npm install

# 5. Start the agent
docker-compose up
```

The agent is ready when you see:

```
[OpenClaw] ContractClaw agent online. Listening on Telegram channel.
[OpenClaw] HEARTBEAT scheduler armed — next run: 08:00 IST
```

Send any PDF or DOCX contract to your Telegram bot to begin.

### Option B — Local (Node 20+)

```bash
# Prerequisites: Node.js 20+, npm, openclaw installed globally
npm install -g openclaw@latest

git clone https://github.com/your-org/contractclaw.git
cd contractclaw
cp .env.example .env
# Edit .env with your credentials

npm install
npm run start:local
```

---

## Getting Your Credentials

| Credential | Where to get |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys |
| `TELEGRAM_BOT_TOKEN` | Message @BotFather on Telegram → /newbot |
| `TELEGRAM_CHAT_ID` | Message @userinfobot on Telegram |
| `GEMINI_API_KEY` | aistudio.google.com/app/apikey |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS Console → IAM → Users → Security credentials (attach AmazonBedrockFullAccess policy) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key (`sk-ant-...`) |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Yes | Your Telegram chat/user ID (authorised sender) |
| `ALERT_RECIPIENTS` | No | Comma-separated chat IDs for alert broadcasts |
| `OPENCLAW_WORKSPACE` | No | Path to workspace directory (default: `./workspace`) |

All secrets are read exclusively from environment variables. Nothing is hardcoded.

---

## Example Interaction

Below is a mock Telegram conversation showing the complete flow from upload to alert.

```
─────────────────────────────────────────────
  You → ContractClaw Bot
─────────────────────────────────────────────

  [20 Jan 2025, 09:14]
  📎 CloudVault_MSA_2025.pdf

─────────────────────────────────────────────
  ContractClaw → You
─────────────────────────────────────────────

  ✅ Contract registered: cloudvault-saas-2025-01

  Parties:    Acme Corp ↔ CloudVault Technologies
  Type:       Service Agreement
  Duration:   2025-01-15 → 2026-01-14
  Governing:  Maharashtra, India

  Obligations extracted: 6
    • Annual renewal (auto) — 2025-12-15
    • Q1 SLA review — 2025-04-01
    • Q2 SLA review — 2025-07-01
    • Monthly payment — recurring (1st of month)
    • Annual audit — 2025-12-01
    • Termination notice — 90 days

  ⚠️ Risk flags: 2
    [HIGH]   Auto-renewal notice window is only 21 days
             — industry standard is 30+ days. Review
               and negotiate before Dec 2025.
    [MEDIUM] Asymmetric penalty clause: CloudVault
             liability capped at 1× monthly fee;
             Acme Corp penalties uncapped.

  Next alert: 📋 Advisory on 2025-11-15 (30 days
  before renewal deadline)

─────────────────────────────────────────────

  ... (30 days before renewal deadline) ...

  [15 Nov 2025, 08:00]

  📋 CONTRACT REMINDER — 30 days
  Contract:     cloudvault-saas-2025-01
  Counterparty: CloudVault Technologies
  Obligation:   Annual auto-renewal — contract
                renews for 12 months unless notice
                served by 2025-12-15
  Deadline:     2025-12-15
  Days remaining: 30
  Action: Serve written termination notice now if
          you do not intend to renew. Notice window
          is 21 days — you have limited time.

─────────────────────────────────────────────
  You → ContractClaw Bot
─────────────────────────────────────────────

  which contracts renew next month?

─────────────────────────────────────────────
  ContractClaw → You
─────────────────────────────────────────────

  1 contract has a renewal deadline next month:

  • cloudvault-saas-2025-01
    Counterparty: CloudVault Technologies
    Renewal date: 2026-01-14
    Auto-renews:  Yes (21-day notice window)
    Status:       ⚠️ Notice must be served by
                  2025-12-24 to avoid renewal
```

---

## Alert Examples

All four alert tiers sent by `alert.ts`:

### 📋 Advisory — 30 days before deadline

```
📋 CONTRACT REMINDER — 30 days
Contract:      cloudvault-saas-2025-01
Counterparty:  CloudVault Technologies
Obligation:    Annual auto-renewal — serves notice by 2025-12-15
Deadline:      2025-12-15
Days remaining: 30
Action:        Review renewal terms and serve notice if not renewing.
```

### ⚠️ Warning — 7 days before deadline

```
⚠️ CONTRACT WARNING — 7 days
Contract:      cloudvault-saas-2025-01
Counterparty:  CloudVault Technologies
Obligation:    Annual auto-renewal — serves notice by 2025-12-15
Deadline:      2025-12-15
Days remaining: 7
Action:        Immediate action required. Confirm notice has been served
               or prepare renewal documentation.
```

### 🚨 Urgent — 1 day before deadline

```
🚨 URGENT — ACTION REQUIRED TOMORROW
Contract:      cloudvault-saas-2025-01
Counterparty:  CloudVault Technologies
Obligation:    Annual auto-renewal — serves notice by 2025-12-15
Deadline:      2025-12-15
Days remaining: 1
Action:        Final notice. Serve termination notice today or the
               contract will auto-renew for another 12 months.
```

### ❌ Overdue — deadline passed without resolution

```
❌ OVERDUE OBLIGATION
Contract:      cloudvault-saas-2025-01
Counterparty:  CloudVault Technologies
Obligation:    Q1 SLA review meeting must be held
Was due:       2025-04-01
Action required immediately. Mark as resolved once completed or
escalate to contract manager.
```

---

## Security & Data Privacy

ContractClaw is designed around a local-first, privacy-preserving architecture.

| What | Where it lives | Leaves the machine? |
|---|---|---|
| Raw contract text | Extracted in memory only, never logged | Only sent to Anthropic API for obligation extraction |
| Extracted obligations | `workspace/registry/*.yaml` on local disk | No |
| Risk flags | `workspace/registry/*.yaml` on local disk | No |
| Alert logs | Embedded in YAML per-obligation | No |
| API keys | Environment variables only | No |

**Commitments:**

- `workspace/registry/` is `.gitignore`d — obligation data is never committed to version control
- `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` are read exclusively from environment variables; they are never hardcoded or logged
- File uploads are validated before processing: maximum 10 MB, PDF and DOCX MIME types only
- The `allowFrom` list in `openclaw.json` gates which Telegram chat IDs can submit contracts — the bot ignores messages from any other source
- Raw contract text is never written to disk or logged in any form; it passes through memory from `ingest.ts` to `extract.ts` and is then discarded
- Only the structured obligation JSON extracted by Claude Sonnet is persisted

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | [OpenClaw](https://github.com/openclaw/openclaw) (latest, Node 24+) |
| LLM Backend | Anthropic Claude Sonnet (`claude-sonnet-4-20250514`) |
| Primary Channel | Telegram Bot |
| PDF Parsing | `pdf-parse` |
| DOCX Parsing | `mammoth` |
| Obligation Registry | YAML files (`js-yaml`) in `workspace/registry/` |
| Scheduling | OpenClaw HEARTBEAT.md daemon (cron `0 8 * * *`, Asia/Kolkata) |
| Runtime | Node.js 24+ / TypeScript (strict mode, ES modules) |
| Containerisation | Docker Compose |

---

## Repository Structure

```
contractclaw/
├── workspace/
│   ├── SOUL.md              # Agent persona and tone
│   ├── AGENTS.md            # Operating instructions + contract memory
│   ├── IDENTITY.md          # Agent name, emoji, tagline
│   ├── HEARTBEAT.md         # Daily deadline scheduler instructions
│   ├── SKILLS.md            # Skill loader manifest
│   └── skills/
│       └── contractclaw/
│           ├── SKILL.md     # Skill definition (trigger phrases, pipeline)
│           ├── ingest.ts    # Document ingestion + text extraction
│           ├── extract.ts   # Claude API obligation extraction
│           ├── registry.ts  # YAML registry read/write
│           ├── alert.ts     # Tiered alert formatting + dispatch
│           ├── diff.ts      # Contract version diffing
│           ├── query.ts     # Natural language query handler
│           └── risk.ts      # Clause risk flagging
├── src/
│   └── types/
│       ├── obligation.ts    # TypeScript obligation schema types
│       └── registry.ts      # Registry schema types
├── openclaw.json            # OpenClaw gateway configuration
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Definition of Done

- [ ] PDF upload → obligation extraction → YAML saved correctly
- [ ] DOCX upload → obligation extraction → YAML saved correctly
- [ ] HEARTBEAT.md fires and produces correct alerts for a contract with a deadline 30 / 7 / 1 days away
- [ ] Natural language query returns accurate results from registry
- [ ] Re-upload of amended contract produces a diff report
- [ ] Risk flags are correctly identified for auto-renewal with short notice window
- [ ] Overdue obligation triggers OVERDUE alert (not just standard tiers)
- [ ] File > 10 MB is rejected with a clear Telegram message
- [ ] Non-PDF / DOCX file is rejected with a clear Telegram message
- [ ] `docker-compose up` starts the agent successfully

---

## Contributing

This is a hackathon project. If you find it useful and want to extend it, open an issue or PR. Key areas for improvement:

- Support for additional file types (scanned PDFs via OCR, HTML contracts)
- Multi-user / multi-tenant registry isolation
- Web dashboard for obligation visualisation
- Email and Slack alert channels alongside Telegram
- Clause-level confidence scoring and human-in-the-loop confirmation flow

---

*Built with [OpenClaw](https://github.com/openclaw/openclaw) and [Claude Sonnet](https://anthropic.com) at a hackathon. Contract data never leaves your machine.*
