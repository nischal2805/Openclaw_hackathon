import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ContractClawError } from '../../../src/types/obligation.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function ingestDocument(filePath: string): Promise<{
  rawText: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
}> {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');

  if (ext !== 'pdf' && ext !== 'docx') {
    throw new ContractClawError(
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported file type ".${ext}". Only PDF and DOCX files are accepted.`,
      { fileName, ext }
    );
  }

  const fileType = ext as 'pdf' | 'docx';

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(filePath);
  } catch (err) {
    throw new ContractClawError(
      'PARSE_FAILED',
      `Could not access file "${fileName}". Please ensure the file was uploaded correctly.`,
      { fileName, error: String(err) }
    );
  }

  if (fileStat.size > MAX_FILE_SIZE_BYTES) {
    throw new ContractClawError(
      'FILE_TOO_LARGE',
      `File "${fileName}" is ${(fileStat.size / (1024 * 1024)).toFixed(1)}MB, which exceeds the 10MB limit. Please upload a smaller file.`,
      { fileName, fileSizeBytes: fileStat.size, maxSizeBytes: MAX_FILE_SIZE_BYTES }
    );
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(filePath);
  } catch (err) {
    throw new ContractClawError(
      'PARSE_FAILED',
      `Failed to read file "${fileName}". Please try uploading the file again.`,
      { fileName, error: String(err) }
    );
  }

  let rawText: string;

  if (fileType === 'pdf') {
    rawText = await extractPdf(fileBuffer, fileName);
  } else {
    rawText = await extractDocx(fileBuffer, fileName);
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new ContractClawError(
      'PARSE_FAILED',
      `No readable text could be extracted from "${fileName}". The file may be a scanned image or password-protected. Please upload a text-based PDF or DOCX.`,
      { fileName, fileType }
    );
  }

  return { rawText, fileName, fileType };
}

async function extractPdf(buffer: Buffer, fileName: string): Promise<string> {
  let pdfParse: (buffer: Buffer) => Promise<{ text: string }>;
  try {
    const mod = await import('pdf-parse');
    pdfParse = (mod.default ?? mod) as typeof pdfParse;
  } catch (err) {
    throw new ContractClawError(
      'PARSE_FAILED',
      'PDF parsing library is not available. Please contact support.',
      { fileName, error: String(err) }
    );
  }

  try {
    const result = await pdfParse(buffer);
    return result.text;
  } catch (err) {
    throw new ContractClawError(
      'PARSE_FAILED',
      `Failed to parse PDF "${fileName}". The file may be corrupted, encrypted, or contain only scanned images.`,
      { fileName, error: String(err) }
    );
  }
}

async function extractDocx(buffer: Buffer, fileName: string): Promise<string> {
  let mammoth: { extractRawText: (options: { buffer: Buffer }) => Promise<{ value: string }> };
  try {
    const mod = await import('mammoth');
    mammoth = (mod.default ?? mod) as typeof mammoth;
  } catch (err) {
    throw new ContractClawError(
      'PARSE_FAILED',
      'DOCX parsing library is not available. Please contact support.',
      { fileName, error: String(err) }
    );
  }

  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    throw new ContractClawError(
      'PARSE_FAILED',
      `Failed to parse DOCX "${fileName}". The file may be corrupted or in an unsupported format.`,
      { fileName, error: String(err) }
    );
  }
}
