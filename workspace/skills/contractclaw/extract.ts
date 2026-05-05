import Anthropic from '@anthropic-ai/sdk';
import type { ObligationManifest } from '../../../src/types/obligation.js';
import { ContractClawError } from '../../../src/types/obligation.js';

const SYSTEM_PROMPT = `You are a contract analysis engine. Extract ALL obligations from the contract text provided.
Return ONLY valid JSON. No preamble. No markdown. No explanation.

Output schema:
{
  "contract_id": "<slug>",
  "parties": { "org": "<organisation name>", "counterparty": "<other party name>" },
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
}`;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

function parseManifestJson(raw: string): ObligationManifest {
  // Strip any markdown code fences in case the model wraps output despite instructions
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(stripped) as ObligationManifest;
}

async function callClaude(client: Anthropic, userContent: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'Claude returned no text content block in the extraction response.',
    );
  }

  return textBlock.text;
}

export async function extractObligations(
  rawText: string,
  fileName: string,
): Promise<ObligationManifest> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'ANTHROPIC_API_KEY environment variable is not set.',
    );
  }

  const client = new Anthropic({ apiKey });

  const userContent = `Extract all obligations from the following contract.\n\nFilename: ${fileName}\n\nContract text:\n${rawText}`;

  // First attempt
  let rawJson: string;
  try {
    rawJson = await callClaude(client, userContent);
  } catch (err) {
    if (err instanceof ContractClawError) throw err;
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      `Claude API call failed: ${(err as Error).message}`,
      { originalError: String(err) },
    );
  }

  let parsed: ObligationManifest;
  try {
    parsed = parseManifestJson(rawJson);
  } catch (_firstParseErr) {
    // Retry once with a stricter instruction
    const retryContent =
      userContent +
      '\n\nReturn ONLY the JSON object. No other text whatsoever.';

    let retryJson: string;
    try {
      retryJson = await callClaude(client, retryContent);
    } catch (err) {
      if (err instanceof ContractClawError) throw err;
      throw new ContractClawError(
        'EXTRACTION_FAILED',
        `Claude API call failed on retry: ${(err as Error).message}`,
        { originalError: String(err) },
      );
    }

    try {
      parsed = parseManifestJson(retryJson);
    } catch (secondParseErr) {
      throw new ContractClawError(
        'EXTRACTION_FAILED',
        `Failed to parse JSON from Claude response after two attempts: ${(secondParseErr as Error).message}`,
        { parseError: String(secondParseErr) },
      );
    }
  }

  // Enrich with runtime metadata
  parsed.registered_at = new Date().toISOString();
  parsed.source_filename = fileName;
  parsed.version = 1;

  return parsed;
}
