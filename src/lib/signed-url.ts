import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

function sign(docId: string, expiresAt: number): string {
  return createHmac('sha256', config.jwtSecret)
    .update(`${docId}:${expiresAt}`)
    .digest('base64url');
}

export function createSignedDocumentUrl(documentId: string): { url: string; expiresAt: string } {
  const expiresAt = Math.floor(Date.now() / 1000) + config.signedUrlTtlSeconds;
  const signature = sign(documentId, expiresAt);
  const url = `${config.publicBaseUrl}/api/documents/download/${documentId}?expires=${expiresAt}&signature=${signature}`;
  return { url, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export function verifyDocumentSignature(documentId: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = sign(documentId, expiresAt);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
