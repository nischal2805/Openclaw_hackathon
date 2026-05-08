import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const STATE_DIR = fileURLToPath(new URL('../../../workspace/state/', import.meta.url));

export type AlertKey = string; // `${contractId}:${obligationId}:${tier}`

export function makeAlertKey(contractId: string, obligationId: string, tier: string): AlertKey {
  return `${contractId}:${obligationId}:${tier}`;
}

export async function loadTodaySentAlerts(): Promise<Set<AlertKey>> {
  const today = new Date().toISOString().slice(0, 10);
  const filePath = path.join(STATE_DIR, `sent-${today}.json`);
  try {
    const raw = await readFile(filePath, 'utf8');
    return new Set(JSON.parse(raw) as AlertKey[]);
  } catch {
    return new Set<AlertKey>();
  }
}

export async function persistSentAlerts(sentAlerts: Set<AlertKey>): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await mkdir(STATE_DIR, { recursive: true });
  const filePath = path.join(STATE_DIR, `sent-${today}.json`);
  await writeFile(filePath, JSON.stringify([...sentAlerts]), 'utf8');
}
