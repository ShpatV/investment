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

export async function saveFile(buffer: Buffer, mimeType: string): Promise<StoredFile> {
  assertAllowedFile(mimeType, buffer.byteLength);
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
