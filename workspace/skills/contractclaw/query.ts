import Anthropic from '@anthropic-ai/sdk';
import type { ObligationManifest } from '../../../src/types/obligation.js';
import { ContractClawError } from '../../../src/types/obligation.js';
import { loadAllContracts } from './registry.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;

function buildRegistrySummary(manifests: ObligationManifest[]): string {
  if (manifests.length === 0) {
    return 'No contracts registered.';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lines: string[] = [];

  for (const manifest of manifests) {
    const upcomingObligations = manifest.obligations
      .filter((o) => !o.resolved && o.deadline !== null)
      .map((o) => {
        const deadlineDate = new Date(o.deadline as string);
        const daysRemaining = Math.ceil(
          (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        return { o, daysRemaining };
      })
      .filter(({ daysRemaining }) => daysRemaining >= 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 3)
      .map(
        ({ o, daysRemaining }) =>
          `${o.type}:${o.deadline}(${daysRemaining}d)`
      );

    const upcomingStr =
      upcomingObligations.length > 0
        ? upcomingObligations.join(', ')
        : 'none';

    lines.push(
      `${manifest.contract_id} | ${manifest.parties.counterparty} | ${manifest.dates.end_date ?? 'N/A'} | ${manifest.obligations.length} obligations | upcoming: ${upcomingStr}`
    );
  }

  return lines.join('\n');
}

export async function queryRegistry(userQuestion: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'ANTHROPIC_API_KEY is not set in environment variables.'
    );
  }

  let manifests: ObligationManifest[];
  try {
    manifests = await loadAllContracts();
  } catch (err) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      `Failed to load contracts from registry: ${(err as Error).message}`
    );
  }

  const summary = buildRegistrySummary(manifests);

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system:
        'You are a contract registry assistant. Answer questions about the registered contracts concisely and accurately. Use only the data provided.',
      messages: [
        {
          role: 'user',
          content: `Registry summary:\n${summary}\n\nQuestion: ${userQuestion}`,
        },
      ],
    });
  } catch (err) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      `Claude API request failed: ${(err as Error).message}`,
      { userQuestion }
    );
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'Claude API returned no text content in response.',
      { userQuestion }
    );
  }

  return textBlock.text;
}
