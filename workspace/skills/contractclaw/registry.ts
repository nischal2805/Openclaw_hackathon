import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { ObligationManifest, Obligation } from '../../../src/types/obligation.js';
import { ContractClawError } from '../../../src/types/obligation.js';
import { logError } from './logger.js';

const REGISTRY_DIR = fileURLToPath(new URL('../../../workspace/registry/', import.meta.url));
const AGENTS_MD_PATH = fileURLToPath(new URL('../../../workspace/AGENTS.md', import.meta.url));

async function ensureRegistryDir(): Promise<void> {
  await fs.mkdir(REGISTRY_DIR, { recursive: true });
}

export async function saveContract(manifest: ObligationManifest): Promise<string> {
  await ensureRegistryDir();

  const filePath = path.join(REGISTRY_DIR, `${manifest.contract_id}.yaml`);

  let version = 1;
  try {
    await fs.access(filePath);
    // File exists — increment version
    const existing = await loadContract(manifest.contract_id);
    version = (existing.version ?? 1) + 1;
  } catch {
    // File does not exist — first save
  }

  const manifestToSave: ObligationManifest = {
    ...manifest,
    version,
    registered_at: manifest.registered_at ?? new Date().toISOString(),
  };

  const yamlContent = yaml.dump(manifestToSave, { lineWidth: 120, noRefs: true });

  try {
    await fs.writeFile(filePath, yamlContent, 'utf8');
  } catch (err) {
    throw new ContractClawError(
      'REGISTRY_ERROR',
      `Failed to write contract file for ${manifest.contract_id}: ${(err as Error).message}`,
      { contractId: manifest.contract_id, filePath }
    );
  }

  await appendAgentsSummary(manifest);

  return manifest.contract_id;
}

async function appendAgentsSummary(manifest: ObligationManifest): Promise<void> {
  const summaryLine = `[${manifest.contract_id}] | [${manifest.parties.counterparty}] | [${manifest.dates.end_date ?? 'N/A'}] | [${manifest.obligations.length}]`;

  let content: string;
  try {
    content = await fs.readFile(AGENTS_MD_PATH, 'utf8');
  } catch {
    // AGENTS.md does not exist yet — create minimal structure
    content = '# ContractClaw Operating Instructions\n\n## Memory\n';
  }

  const memoryMarker = '## Memory';
  const markerIndex = content.indexOf(memoryMarker);

  if (markerIndex === -1) {
    // No Memory section found — append at end
    const updated = content.trimEnd() + `\n\n## Memory\n${summaryLine}\n`;
    await fs.writeFile(AGENTS_MD_PATH, updated, 'utf8');
    return;
  }

  // Check if summary line for this contract_id already exists; replace it if so
  const contractIdToken = `[${manifest.contract_id}]`;
  const lines = content.split('\n');
  const existingLineIndex = lines.findIndex(
    (line) => line.startsWith(contractIdToken)
  );

  if (existingLineIndex !== -1) {
    lines[existingLineIndex] = summaryLine;
    await fs.writeFile(AGENTS_MD_PATH, lines.join('\n'), 'utf8');
    return;
  }

  // Append after the Memory heading line
  const memoryLineIndex = lines.findIndex((line) => line.trim() === memoryMarker.trim());
  if (memoryLineIndex !== -1) {
    lines.splice(memoryLineIndex + 1, 0, summaryLine);
    await fs.writeFile(AGENTS_MD_PATH, lines.join('\n'), 'utf8');
    return;
  }

  // Fallback: append at end of file
  const updated = content.trimEnd() + `\n${summaryLine}\n`;
  await fs.writeFile(AGENTS_MD_PATH, updated, 'utf8');
}

export async function loadAllContracts(): Promise<ObligationManifest[]> {
  await ensureRegistryDir();

  let files: string[];
  try {
    files = await fs.readdir(REGISTRY_DIR);
  } catch (err) {
    throw new ContractClawError(
      'REGISTRY_ERROR',
      `Failed to read registry directory: ${(err as Error).message}`,
      { registryDir: REGISTRY_DIR }
    );
  }

  const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  const manifests: ObligationManifest[] = [];

  for (const file of yamlFiles) {
    const filePath = path.join(REGISTRY_DIR, file);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = yaml.load(raw) as ObligationManifest;
      manifests.push(parsed);
    } catch (err) {
      await logError(
        'REGISTRY_ERROR',
        `Skipping malformed file ${file}: ${(err as Error).message}`,
        { filePath }
      );
    }
  }

  return manifests;
}

export async function loadContract(contractId: string): Promise<ObligationManifest> {
  const filePath = path.join(REGISTRY_DIR, `${contractId}.yaml`);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    throw new ContractClawError(
      'REGISTRY_ERROR',
      `Contract not found: ${contractId}`,
      { contractId, filePath }
    );
  }

  try {
    return yaml.load(raw) as ObligationManifest;
  } catch (err) {
    throw new ContractClawError(
      'REGISTRY_ERROR',
      `Failed to parse contract file for ${contractId}: ${(err as Error).message}`,
      { contractId, filePath }
    );
  }
}

export async function updateObligation(
  contractId: string,
  obligationId: string,
  updates: Partial<Obligation>
): Promise<void> {
  const manifest = await loadContract(contractId);

  const obligationIndex = manifest.obligations.findIndex((o) => o.id === obligationId);

  if (obligationIndex === -1) {
    throw new ContractClawError(
      'REGISTRY_ERROR',
      `Obligation ${obligationId} not found in contract ${contractId}`,
      { contractId, obligationId }
    );
  }

  manifest.obligations[obligationIndex] = {
    ...manifest.obligations[obligationIndex],
    ...updates,
  };

  const filePath = path.join(REGISTRY_DIR, `${contractId}.yaml`);
  const yamlContent = yaml.dump(manifest, { lineWidth: 120, noRefs: true });

  try {
    await fs.writeFile(filePath, yamlContent, 'utf8');
  } catch (err) {
    throw new ContractClawError(
      'REGISTRY_ERROR',
      `Failed to save updated obligation for contract ${contractId}: ${(err as Error).message}`,
      { contractId, obligationId, filePath }
    );
  }
}
