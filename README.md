# 🦞 ContractClaw

### *Your vigilant contract sentinel. Never miss a deadline.*

[![Built with OpenClaw](https://img.shields.io/badge/Built%20with-OpenClaw-blueviolet)](https://github.com/openclaw/openclaw)
[![LLM](https://img.shields.io/badge/LLM-Anthropic%20%7C%20Gemini%20%7C%20Bedrock-blue)](https://anthropic.com)
[![Channel](https://img.shields.io/badge/Channel-Telegram-2CA5E0)](https://telegram.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-31%20passing-brightgreen)]()

---

## What It Does

Businesses lose thousands — sometimes millions — every year to missed contract deadlines: silent auto-renewals that lock in another year of a vendor you wanted to leave, SLA review windows that quietly expire, payment milestones that slip past unnoticed. ContractClaw eliminates that risk entirely.

Upload any vendor, service, or employment contract as a PDF or DOCX directly into Telegram. ContractClaw's AI engine reads the full document, extracts every single obligation — renewal clauses, termination notice periods, payment schedules, audit requirements, liability caps — and stores them in a private local YAML registry. From that moment on, you receive proactive Telegram alerts at exactly 30 days, 7 days, and 1 day before each deadline, plus an immediate flag the moment anything goes overdue.

No dashboard to log into. No spreadsheet to maintain. No deadline gets missed.

---

## Architecture

```
┌─────────────┐    file upload     ┌──────────────────────────────────────────────────────────────┐
│             │ ─────────────────► │                   OpenClaw Agent Runtime                     │
│  Telegram   │                    │                                                              │
│    User     │                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│             │ ◄───────────────── │  │ ingest   │─►│ extract  │─►│  risk    │─►│ registry   │  │
└─────────────┘  alert / confirm   │  │   .ts    │  │   .ts    │  │   .ts    │  │    .ts     │  │
                                   │  │          │  │          │  │          │  │            │  │
                                   │  │pdf-parse │  │  llm.ts  │  │  flags   │  │ YAML disk  │  │
                                   │  │mammoth   │  │  ───────►│  │          │  └─────┬──────┘  │
                                   │  └──────────┘  │Anthropic │  └──────────┘        │         │
                                   │                │ Gemini   │                       ▼         │
                                   │                │ Bedrock/ │  ┌──────────┐  ┌────────────┐  │
                                   │                │MiniMax   │  │ query.ts │  │  alert.ts  │  │
                                   │                └──────────┘  │ (NL Q&A) │  │ ADVISORY/  │  │
                                   │                              └──────────┘  │ WARNING/   │  │
                                   │  ┌────────────────────────────────────┐   │ URGENT/    │  │
                                   │  │  HEARTBEAT.md (cron · 08:00 IST)  │──►│ OVERDUE    │  │
                                   │  └────────────────────────────────────┘   └─────┬──────┘  │
                                   └──────────────────────────────────────────────────┼─────────┘
                                                                                      │
                                                                                      ▼
                                                                               ┌─────────────┐
                                                                               │  Telegram   │
                                                                               │    Alert    │
                                                                               └─────────────┘
```

**Pipeline (each contract upload):**

1. `ingest.ts` — extract raw text from PDF (`pdf-parse`) or DOCX (`mammoth`); validate size/type
2. `extract.ts` — call LLM with strict JSON extraction prompt via `llm.ts`
3. `validate.ts` — validate and coerce the manifest; collect all field errors before throwing
4. `risk.ts` — programmatic risk analysis; merge flags into manifest
5. `registry.ts` — serialise to YAML at `workspace/registry/<contract_id>.yaml`
6. `diff.ts` — if contract ID already exists, compute added/removed obligations and changed deadlines
7. `alert.ts` + `telegram.ts` — send structured confirmation back to user
8. `heartbeat.ts` — runs daily at 08:00 IST; evaluates all deadlines, deduplicates, dispatches tiered alerts

---

## Features

- **PDF & DOCX ingestion** — upload directly to Telegram; automatic text extraction with file-size and MIME-type validation (max 10 MB)
- **Multi-provider LLM** — choose Anthropic Claude, Google Gemini, or AWS Bedrock (MiniMax M2.5) via a single `LLM_PROVIDER` env var; reasoning-model response parsing included
- **AI-powered obligation extraction** — structured JSON manifest: parties, dates, every obligation type, risk clauses; nothing in the fine print is skipped
- **Local YAML registry** — all extracted data lives on your machine in `workspace/registry/`; no contract text stored in any cloud database
- **Tiered proactive alerts** — Telegram notifications at 30 days (Advisory), 7 days (Warning), 1 day (Urgent), and immediately on overdue
- **Natural language queries** — ask "which contracts renew next month?" and get a direct answer from the live registry
- **Version diffing on re-upload** — upload an amended contract and receive a clear diff: added obligations, removed obligations, changed deadlines, new risk flags
- **Risk flag analysis** — auto-renewal windows < 30 days (HIGH), asymmetric penalties (MEDIUM), unlimited liability (HIGH), out-of-jurisdiction governing law all surfaced at ingestion
- **Daily heartbeat at 08:00 IST** — cron daemon evaluates every registered obligation each morning, sends daily digest of everything due in next 30 days; duplicate alerts on same day suppressed
- **Full TypeScript** — strict mode, ES modules, 31 passing tests

---

## Quick Start

### Option A — Local (Node 20+)

```bash
# 1. Install OpenClaw globally
npm install -g openclaw@latest

# 2. Clone and install
git clone https://github.com/nischal2805/Openclaw_hackathon.git
cd Openclaw_hackathon
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set at minimum: LLM_PROVIDER, your chosen API key, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

# 4. Start the agent
npm start
```

### Option B — Docker

```bash
git clone https://github.com/nischal2805/Openclaw_hackathon.git
cd Openclaw_hackathon
cp .env.example .env
# Edit .env with your credentials
docker-compose up
```

The agent is ready when you see:

```
[OpenClaw] ContractClaw agent online. Listening on Telegram channel.
[OpenClaw] HEARTBEAT scheduler armed — next run: 08:00 IST
```

Send any PDF or DOCX contract to your Telegram bot to begin.

---

## LLM Provider Selection

Set `LLM_PROVIDER` in `.env` to choose your AI backend:

| `LLM_PROVIDER` | Model used | Required env vars |
|---|---|---|
| `anthropic` (default) | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| `gemini` | `gemini-1.5-pro` | `GEMINI_API_KEY` |
| `bedrock` | `minimax.minimax-m2.5` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |

Override specific models with `ANTHROPIC_MODEL`, `GEMINI_MODEL`, or `BEDROCK_MODEL_ID`.

**Testing Bedrock connectivity:**

```bash
node --env-file=.env test-bedrock.mjs
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | No | `anthropic` \| `gemini` \| `bedrock` (default: `anthropic`) |
| `ANTHROPIC_API_KEY` | If provider=anthropic | `sk-ant-...` from [console.anthropic.com](https://console.anthropic.com/settings/api-keys) |
| `ANTHROPIC_MODEL` | No | Override Anthropic model (default: `claude-sonnet-4-20250514`) |
| `GEMINI_API_KEY` | If provider=gemini | From [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| `GEMINI_MODEL` | No | Override Gemini model (default: `gemini-1.5-pro`) |
| `AWS_ACCESS_KEY_ID` | If provider=bedrock | IAM user with `AmazonBedrockFullAccess` |
| `AWS_SECRET_ACCESS_KEY` | If provider=bedrock | IAM user secret key |
| `AWS_REGION` | No | Bedrock region (default: `us-east-1`) |
| `BEDROCK_MODEL_ID` | No | Override Bedrock model (default: `minimax.minimax-m2.5`) |
| `TELEGRAM_BOT_TOKEN` | Yes | From [@BotFather](https://t.me/BotFather) → `/newbot` |
| `TELEGRAM_CHAT_ID` | Yes | Your chat ID from [@userinfobot](https://t.me/userinfobot) |
| `ALERT_RECIPIENTS` | No | Comma-separated chat IDs for broadcast alerts |
| `OPENCLAW_WORKSPACE` | No | Workspace path (default: `./workspace`) |

All secrets read exclusively from environment variables. Nothing hardcoded.

---

## Getting Your Credentials

| Credential | How to get |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys |
| `GEMINI_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS Console → IAM → Users → Security credentials → attach `AmazonBedrockFullAccess` policy. Enable MiniMax M2.5 in AWS Console → Bedrock → Model access. |
| `TELEGRAM_BOT_TOKEN` | Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` |
| `TELEGRAM_CHAT_ID` | Message [@userinfobot](https://t.me/userinfobot) on Telegram |

---

## Example Interaction

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

## Alert Tiers

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
Obligation:    Annual auto-renewal — serves notice by 2025-12-15
Deadline:      2025-12-15
Days remaining: 1
Action:        Final notice. Serve termination notice today or the
               contract will auto-renew for another 12 months.
```

### ❌ Overdue

```
❌ OVERDUE OBLIGATION
Contract:      cloudvault-saas-2025-01
Obligation:    Q1 SLA review meeting must be held
Was due:       2025-04-01
Action required immediately.
```

---

## Security & Data Privacy

| What | Where it lives | Leaves the machine? |
|---|---|---|
| Raw contract text | Memory only, never logged or written to disk | Sent to your chosen LLM API for extraction only |
| Extracted obligations | `workspace/registry/*.yaml` on local disk | No |
| Risk flags | Embedded in YAML registry | No |
| Alert logs | Per-obligation in YAML | No |
| API keys | Environment variables only | No |
| Error logs | `workspace/logs/error.log` — sensitive fields stripped | No |

- `workspace/registry/` is `.gitignore`d — contract data never committed
- API keys and bot tokens read exclusively from environment variables; never hardcoded or logged
- File uploads validated before processing: max 10 MB, PDF/DOCX only
- `allowFrom` in `openclaw.json` gates which Telegram chat IDs can submit contracts
- Raw contract text stripped from all error log context before writing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | [OpenClaw](https://github.com/openclaw/openclaw) (Node 20+) |
| LLM — Anthropic | `@anthropic-ai/sdk` · `claude-sonnet-4-20250514` |
| LLM — Google | `@google/generative-ai` · `gemini-1.5-pro` |
| LLM — AWS Bedrock | `@aws-sdk/client-bedrock-runtime` · MiniMax M2.5 (ConverseCommand) |
| Telegram Channel | Native `fetch` with retry + exponential backoff |
| PDF Parsing | `pdf-parse` |
| DOCX Parsing | `mammoth` |
| Obligation Registry | YAML files (`js-yaml`) in `workspace/registry/` |
| Manifest Validation | Custom `validate.ts` — collects all errors before throwing |
| Scheduling | OpenClaw HEARTBEAT.md daemon (cron `0 8 * * *`, Asia/Kolkata) |
| Runtime | Node.js 20+ / TypeScript 5 (strict, ES modules, NodeNext) |
| Tests | Vitest 4 — 31 tests across diff, risk, validate modules |
| Containerisation | Docker Compose (optional) |

---

## Repository Structure

```
contractclaw/
├── workspace/
│   ├── SOUL.md                  # Agent persona and tone
│   ├── AGENTS.md                # Operating instructions + contract memory
│   ├── IDENTITY.md              # Agent name, emoji, tagline
│   ├── HEARTBEAT.md             # Daily deadline scheduler
│   ├── SKILLS.md                # Skill loader manifest
│   └── skills/contractclaw/
│       ├── SKILL.md             # Skill definition (trigger phrases, pipeline)
│       ├── llm.ts               # Multi-provider LLM abstraction
│       ├── ingest.ts            # Document ingestion + text extraction
│       ├── extract.ts           # Obligation extraction via LLM
│       ├── validate.ts          # Manifest validation + coercion
│       ├── registry.ts          # YAML registry read/write
│       ├── alert.ts             # Tiered alert formatting
│       ├── diff.ts              # Contract version diffing
│       ├── query.ts             # Natural language query handler
│       ├── risk.ts              # Clause risk flagging
│       ├── telegram.ts          # Telegram API client (retry, broadcast)
│       ├── heartbeat.ts         # Daily deadline checker
│       ├── logger.ts            # Structured error/info logger
│       └── pipeline.ts          # Main orchestrator
├── src/
│   ├── types/obligation.ts      # TypeScript obligation schema types
│   └── tests/
│       ├── diff.test.ts
│       ├── risk.test.ts
│       └── validate.test.ts
├── test-bedrock.mjs             # Quick Bedrock connectivity test
├── openclaw.json                # OpenClaw + ContractClaw configuration
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Running Tests

```bash
npm test                  # run all 31 tests
npm run test:coverage     # with coverage report
npm run typecheck         # TypeScript strict check (0 errors)
```

---

## Do You Need a Frontend?

**Short answer: No — Telegram is the frontend.**

Telegram already gives you:
- File upload interface (PDF/DOCX drag-and-drop)
- Rich formatted messages (obligation summaries, risk flags, alerts)
- Push notifications for every alert tier
- Natural language query interface

A separate web dashboard makes sense only if you need:
- Multi-user access (team members viewing the same registry)
- Visual timeline / Gantt of obligations across contracts
- Bulk import / export of contracts
- Role-based access (legal team, finance, management views)

For a single user or small team, Telegram covers everything. If you extend later, the YAML registry is already structured data — a read API on top is trivial.

---

## Contributing

Open an issue or PR. Key areas for improvement:

- OCR support for scanned PDFs
- Multi-tenant registry isolation
- Email and Slack alert channels alongside Telegram
- Web dashboard for obligation visualisation (see above)
- Clause-level confidence scoring + human-in-the-loop confirmation

---

*Built with [OpenClaw](https://github.com/openclaw/openclaw) at a hackathon. Contract data never leaves your machine.*
