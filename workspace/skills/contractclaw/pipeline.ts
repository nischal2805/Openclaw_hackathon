'use strict';

import path from 'path';
import { ingestDocument } from './ingest.js';
import { extractObligations } from './extract.js';
import { analyseRisk } from './risk.js';
import { saveContract, loadContract } from './registry.js';
import { diffContracts } from './diff.js';
import { formatConfirmation } from './alert.js';
import { sendMessage } from './telegram.js';
import { logInfo, logError } from './logger.js';
import type { ContractDiff, ObligationManifest, RiskFlag } from '../../../src/types/obligation.js';
import { ContractClawError } from '../../../src/types/obligation.js';

/**
 * Merge programmatic risk flags from analyseRisk into the manifest's risk_flags,
 * deduplicating by clause_type (programmatic flags win on conflict).
 */
function mergeRiskFlags(manifest: ObligationManifest, incoming: RiskFlag[]): RiskFlag[] {
  if (incoming.length === 0) return manifest.risk_flags;

  const merged = new Map<string, RiskFlag>(
    manifest.risk_flags.map((f) => [f.clause_type, f])
  );

  for (const flag of incoming) {
    merged.set(flag.clause_type, flag);
  }

  return Array.from(merged.values());
}

/**
 * Build a diff summary block to append to the confirmation message.
 */
function buildDiffSummary(diff: ContractDiff): string {
  return [
    '',
    '\u{1F4DD} Changes from previous version:',
    `Added obligations: ${diff.addedObligations.length}`,
    `Removed obligations: ${diff.removedObligations.length}`,
    `Changed deadlines: ${diff.changedDeadlines.length}`,
    `New risk flags: ${diff.newRiskFlags.length}`,
  ].join('\n');
}

/**
 * Return a plain-English, user-facing error message for a given error.
 */
function toUserMessage(error: unknown): string {
  if (error instanceof ContractClawError) {
    switch (error.code) {
      case 'FILE_TOO_LARGE':
        return 'The file you sent is too large (max 10 MB). Please compress it and try again.';
      case 'UNSUPPORTED_FILE_TYPE':
        return 'Only PDF and DOCX files are supported. Please send a supported document.';
      case 'PARSE_FAILED':
        return 'I could not extract text from this document. Please ensure it is not a scanned image and try again.';
      case 'EXTRACTION_FAILED':
        return 'I encountered an error while analysing the contract. Please try again in a moment.';
      case 'REGISTRY_ERROR':
        return 'There was a problem saving the contract to the registry. Please try again.';
      case 'ALERT_FAILED':
        return 'The contract was processed but I failed to send the confirmation. Please check the registry.';
      default:
        return 'An unexpected error occurred while processing your contract. Please try again.';
    }
  }

  return 'An unexpected error occurred while processing your contract. Please try again.';
}

/**
 * Main contract processing pipeline.
 *
 * Orchestrates: ingest → extract → analyseRisk → merge risk flags →
 * diff (if re-upload) → saveContract → sendConfirmation.
 *
 * @param filePath - Absolute path to the uploaded file (PDF or DOCX).
 * @param chatId   - Telegram chat ID to reply to.
 */
export async function processContract(filePath: string, chatId: string): Promise<void> {
  const fileName = path.basename(filePath);

  await logInfo('Processing contract', { fileName, chatId });

  let manifest: ObligationManifest;

  try {
    // Step 1: Ingest document
    const { rawText, fileName: resolvedFileName, fileType } = await ingestDocument(filePath);

    await logInfo('Document ingested', { fileName: resolvedFileName, fileType, chatId });

    // Step 2: Extract obligations via LLM
    manifest = await extractObligations(rawText, resolvedFileName);

    await logInfo('Obligations extracted', {
      contractId: manifest.contract_id,
      obligationCount: manifest.obligations.length,
      confidence: manifest.extraction_confidence,
    });

    // Step 3: Analyse risk and merge programmatic flags into manifest
    const riskSummary = analyseRisk(manifest);
    const allProgrammaticFlags: RiskFlag[] = [
      ...riskSummary.highRisks,
      ...riskSummary.mediumRisks,
      ...riskSummary.lowRisks,
    ];
    manifest = {
      ...manifest,
      risk_flags: mergeRiskFlags(manifest, allProgrammaticFlags),
    };

    // Step 4: Check for existing contract to produce a diff
    let diff: ContractDiff | null = null;
    try {
      const existingManifest = await loadContract(manifest.contract_id);
      diff = diffContracts(existingManifest, manifest);
      await logInfo('Contract diff computed', {
        contractId: manifest.contract_id,
        addedObligations: diff.addedObligations.length,
        removedObligations: diff.removedObligations.length,
        changedDeadlines: diff.changedDeadlines.length,
        newRiskFlags: diff.newRiskFlags.length,
      });
    } catch (err) {
      if (
        err instanceof ContractClawError &&
        err.code === 'REGISTRY_ERROR'
      ) {
        // Contract does not exist yet — this is a new registration, no diff needed
        diff = null;
      } else {
        throw err;
      }
    }

    // Step 5: Persist to registry
    const contractId = await saveContract(manifest);

    await logInfo('Contract saved to registry', { contractId });

    // Step 6: Build and send confirmation
    let confirmationText = formatConfirmation(manifest);

    const hasDiffChanges =
      diff !== null &&
      (diff.addedObligations.length > 0 ||
        diff.removedObligations.length > 0 ||
        diff.changedDeadlines.length > 0 ||
        diff.newRiskFlags.length > 0);

    if (hasDiffChanges) {
      confirmationText += buildDiffSummary(diff!);
    }

    await sendMessage(chatId, confirmationText);

    await logInfo('Contract processed', {
      contractId,
      obligationCount: manifest.obligations.length,
    });
  } catch (error: unknown) {
    const code =
      error instanceof ContractClawError ? error.code : 'UNKNOWN';
    const message =
      error instanceof Error ? error.message : String(error);

    await logError(code, message, { fileName, chatId });

    try {
      await sendMessage(chatId, toUserMessage(error));
    } catch {
      // Best-effort: if Telegram send fails here, swallow so we still rethrow
      // the original error below.
    }

    throw error;
  }
}
