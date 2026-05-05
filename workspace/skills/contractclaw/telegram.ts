import { writeFile } from 'fs/promises';
import { logError } from './logger.js';
import { ContractClawError } from '../../../src/types/obligation.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${TOKEN}`;
const FILE_BASE_URL = `https://api.telegram.org/file/bot${TOKEN}`;

/** Telegram's hard limit on a single sendMessage payload */
const TELEGRAM_MAX_CHARS = 4096;

/** Exponential backoff delays in milliseconds */
const BACKOFF_DELAYS_MS = [1_000, 2_000, 4_000];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split a string that exceeds `maxLen` into chunks, breaking at newline
 * boundaries where possible. Each chunk is guaranteed to be ≤ maxLen chars.
 */
function splitMessage(text: string, maxLen: number = TELEGRAM_MAX_CHARS): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to break at the last newline within the window
    const window = remaining.slice(0, maxLen);
    const lastNewline = window.lastIndexOf('\n');
    const splitAt = lastNewline > 0 ? lastNewline + 1 : maxLen;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * POST to a Telegram Bot API method with automatic retry on network errors or
 * 5xx responses (up to 3 attempts with 1 s / 2 s / 4 s back-off).
 *
 * Throws `ContractClawError(ALERT_FAILED)` when:
 *   - All retries are exhausted (network / 5xx), or
 *   - The server responds with a 4xx status.
 */
async function telegramPost(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `${BASE_URL}/${method}`;

  for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      // Network-level failure (DNS, connection refused, etc.)
      const isLastAttempt = attempt === BACKOFF_DELAYS_MS.length;
      if (isLastAttempt) {
        const msg = `Telegram API network error on ${method} after ${attempt + 1} attempt(s): ${networkError instanceof Error ? networkError.message : String(networkError)}`;
        await logError('ALERT_FAILED', msg, { method });
        throw new ContractClawError('ALERT_FAILED', msg);
      }
      await sleep(BACKOFF_DELAYS_MS[attempt]);
      continue;
    }

    // 4xx — permanent client error, do not retry
    if (response.status >= 400 && response.status < 500) {
      const body = await response.text().catch(() => '(unreadable body)');
      const msg = `Telegram API client error ${response.status} on ${method}: ${body}`;
      await logError('ALERT_FAILED', msg, { method, status: response.status });
      throw new ContractClawError('ALERT_FAILED', msg);
    }

    // 5xx — transient server error, retry with back-off
    if (response.status >= 500) {
      const isLastAttempt = attempt === BACKOFF_DELAYS_MS.length;
      if (isLastAttempt) {
        const msg = `Telegram API server error ${response.status} on ${method} after ${attempt + 1} attempt(s)`;
        await logError('ALERT_FAILED', msg, { method, status: response.status });
        throw new ContractClawError('ALERT_FAILED', msg);
      }
      await sleep(BACKOFF_DELAYS_MS[attempt]);
      continue;
    }

    // 2xx / 3xx — success
    return response.json();
  }

  // Should never be reached, but TypeScript demands a return path
  throw new ContractClawError('ALERT_FAILED', `Telegram API call to ${method} failed unexpectedly`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a text message to the given Telegram chat.
 *
 * Messages longer than 4 096 chars are split into multiple sends at newline
 * boundaries. Retries up to 3 times (1 s / 2 s / 4 s back-off) on network
 * errors or 5xx responses.
 *
 * @throws {ContractClawError} with code `ALERT_FAILED` if delivery fails.
 */
export async function sendMessage(chatId: string, text: string): Promise<void> {
  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    await telegramPost('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'Markdown',
    });
  }
}

/**
 * Download a file identified by its Telegram `fileId` and write it to
 * `destPath` on the local filesystem.
 *
 * Steps:
 *   1. Call `getFile` to resolve the server-side `file_path`.
 *   2. Fetch the raw bytes from the Telegram CDN.
 *   3. Write them to `destPath` via `fs/promises.writeFile`.
 *
 * @throws {ContractClawError} with code `PARSE_FAILED` on any failure.
 */
export async function downloadFile(fileId: string, destPath: string): Promise<void> {
  // Step 1 — resolve file_path
  let filePath: string;
  try {
    const result = await telegramPost('getFile', { file_id: fileId }) as {
      ok: boolean;
      result?: { file_path?: string };
    };

    if (!result.ok || !result.result?.file_path) {
      throw new Error('getFile response missing file_path');
    }
    filePath = result.result.file_path;
  } catch (err) {
    const msg = `Failed to resolve file path for fileId "${fileId}": ${err instanceof Error ? err.message : String(err)}`;
    await logError('PARSE_FAILED', msg, { fileId });
    // Re-wrap in ContractClawError if not already
    if (err instanceof ContractClawError) throw err;
    throw new ContractClawError('PARSE_FAILED', msg);
  }

  // Step 2 — download bytes
  let buffer: Buffer;
  try {
    const downloadUrl = `${FILE_BASE_URL}/${filePath}`;
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (err) {
    const msg = `Failed to download file "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
    await logError('PARSE_FAILED', msg, { fileId, filePath });
    if (err instanceof ContractClawError) throw err;
    throw new ContractClawError('PARSE_FAILED', msg);
  }

  // Step 3 — write to disk
  try {
    await writeFile(destPath, buffer);
  } catch (err) {
    const msg = `Failed to write downloaded file to "${destPath}": ${err instanceof Error ? err.message : String(err)}`;
    await logError('PARSE_FAILED', msg, { fileId, filePath, destPath });
    throw new ContractClawError('PARSE_FAILED', msg);
  }
}

/**
 * Send the same message to multiple Telegram chats sequentially (to stay
 * within Telegram's rate limits).
 *
 * Per-recipient errors are logged but do not abort the remaining sends.
 */
export async function broadcastMessage(chatIds: string[], text: string): Promise<void> {
  for (const chatId of chatIds) {
    try {
      await sendMessage(chatId, text);
    } catch (err) {
      // Log and continue — a failure for one recipient must not block others
      const message = err instanceof Error ? err.message : String(err);
      await logError('ALERT_FAILED', `broadcastMessage failed for chatId "${chatId}": ${message}`, {
        chatId,
      });
    }
  }
}
