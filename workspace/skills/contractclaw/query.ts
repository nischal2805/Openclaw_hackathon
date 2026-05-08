import type { ObligationManifest } from '../../../src/types/obligation.js';
import { ContractClawError } from '../../../src/types/obligation.js';
import { loadAllContracts } from './registry.js';
import { callLLM } from './llm.js';

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

  const systemPrompt =
    'You are a contract registry assistant. Answer questions about the registered contracts concisely and accurately. Use only the data provided.';
  const userMessage = `Registry summary:\n${summary}\n\nQuestion: ${userQuestion}`;

  try {
    return await callLLM(systemPrompt, userMessage, { maxTokens: 1024, temperature: 0.3 });
  } catch (err) {
    if (err instanceof ContractClawError) throw err;
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      `LLM API request failed: ${(err as Error).message}`,
      { userQuestion }
    );
  }
}
