import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdir, appendFile } from 'fs/promises';
import { stderr } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_DIR = resolve(__dirname, '../../../workspace/logs');
const ERROR_LOG = resolve(LOG_DIR, 'error.log');

// Sensitive keys that should be filtered from logs
const FILTERED_KEYS = new Set(['rawText', 'text', 'content', 'contractText']);

/**
 * Sanitize context object by removing sensitive keys
 */
function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context || Object.keys(context).length === 0) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!FILTERED_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Ensure log directory exists
 */
async function ensureLogDir(): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
  } catch (err) {
    // Silently fail — logging setup should not crash the app
    stderr.write(`[ContractClaw Logger] Failed to create log directory: ${LOG_DIR}\n`);
  }
}

/**
 * Log an error with code and optional context
 * Fire-and-forget: never throws, logs failures to stderr instead
 */
export async function logError(
  code: string,
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await ensureLogDir();

    const timestamp = new Date().toISOString();
    const sanitized = sanitizeContext(context);
    const contextPart = sanitized ? ` | context: ${JSON.stringify(sanitized)}` : '';
    const entry = `[${timestamp}] ERROR [${code}] ${message}${contextPart}\n`;

    await appendFile(ERROR_LOG, entry, 'utf-8');
  } catch (err) {
    // Fire-and-forget: write to stderr as fallback, never throw
    stderr.write(
      `[ContractClaw Logger] Failed to write error log: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

/**
 * Log an info message with optional context
 * Fire-and-forget: never throws, logs failures to stderr instead
 */
export async function logInfo(
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await ensureLogDir();

    const timestamp = new Date().toISOString();
    const sanitized = sanitizeContext(context);
    const contextPart = sanitized ? ` | context: ${JSON.stringify(sanitized)}` : '';
    const entry = `[${timestamp}] INFO ${message}${contextPart}\n`;

    await appendFile(ERROR_LOG, entry, 'utf-8');
  } catch (err) {
    // Fire-and-forget: write to stderr as fallback, never throw
    stderr.write(
      `[ContractClaw Logger] Failed to write info log: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}
