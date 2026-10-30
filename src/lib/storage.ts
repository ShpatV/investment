import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { config } from '../config';
import { AppError } from './errors';

export const ALLOWED_MIME_TYPES = new Map<string, string>([
  ['application/pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['text/plain', '.txt'],
  ['text/csv', '.csv'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
]);

export const CLIENT_ALLOWED_CATEGORIES = ['IDENTIFICATION', 'TAX_DOCUMENT', 'OTHER'] as const;

/**
 * Content sniffing for the types that have a reliable signature. The declared
 * MIME type comes from the client, so it must not be trusted on its own.
 * Text formats have no reliable magic bytes and are intentionally unchecked.
 */
const FILE_SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  'application/pdf': (buffer) => buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')),
  'image/png': (buffer) =>
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (buffer) =>
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/webp': (buffer) =>
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (buffer) =>
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (buffer) =>
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
};

export interface StoredFile {
  storageKey: string;
  checksum: string;
  fileSize: number;
}

export async function ensureStorageDir(): Promise<void> {
  await mkdir(config.storageDir, { recursive: true });
}

export function assertAllowedFile(mimeType: string, fileSize: number): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw AppError.validation('Unsupported file type', {
      allowed: [...ALLOWED_MIME_TYPES.keys()],
    });
  }
  if (fileSize > config.maxUploadBytes) {
    throw AppError.tooLarge(`File exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit`);
  }
  if (fileSize <= 0) {
    throw AppError.validation('File is empty');
  }
}

export function assertFileSignature(buffer: Buffer, mimeType: string): void {
  const matches = FILE_SIGNATURES[mimeType];
  if (matches && !matches(buffer)) {
    throw AppError.validation('File content does not match its declared type');
  }
}

export async function saveFile(buffer: Buffer, mimeType: string): Promise<StoredFile> {
  assertAllowedFile(mimeType, buffer.byteLength);
  assertFileSignature(buffer, mimeType);
  await ensureStorageDir();
  const extension = ALLOWED_MIME_TYPES.get(mimeType) ?? '.bin';
  const date = new Date();
  const folder = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const storageKey = `${folder}/${randomUUID()}${extension}`;
  const absolutePath = resolveStoragePath(storageKey);
  await mkdir(resolve(config.storageDir, folder), { recursive: true });
  await writeFile(absolutePath, buffer, { mode: 0o600 });
  const checksum = createHash('sha256').update(buffer).digest('hex');
  return { storageKey, checksum, fileSize: buffer.byteLength };
}

export function resolveStoragePath(storageKey: string): string {
  const base = resolve(config.storageDir);
  const target = resolve(base, storageKey);
  if (!target.startsWith(base + require('node:path').sep) && target !== base) {
    throw AppError.badRequest('Invalid storage key');
  }
  return target;
}

export async function readFileBuffer(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(resolveStoragePath(storageKey));
  } catch {
    throw AppError.notFound('Document file is unavailable');
  }
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch {
    // File already missing — metadata update still proceeds.
  }
}

export function safeDownloadName(filename: string): string {
  const base = filename.replace(/[\\/\r\n"]/g, '_').trim() || 'document';
  const ext = extname(base).slice(0, 10);
  const stem = base.slice(0, Math.max(1, base.length - ext.length)).replace(/[^\w. -]/g, '_');
  return `${stem}${ext}`;
}

export function normalizeOriginalFilename(filename: string): string {
  return filename.replace(/[\\/]/g, '_').slice(0, 255) || 'document';
}

export { join };
