import { describe, expect, it } from 'vitest';
import { createSignedDocumentUrl, verifyDocumentSignature } from '../src/lib/signed-url';
import { hashSecurityAnswer, hashPassword, normalizeSecurityAnswer, verifyPassword, verifySecurityAnswer } from '../src/lib/passwords';

describe('signed document URLs', () => {
  it('creates a verifiable short-lived URL', () => {
    const { url, expiresAt } = createSignedDocumentUrl('11111111-1111-4111-8111-111111111111');
    const parsed = new URL(url);
    const expires = Number(parsed.searchParams.get('expires'));
    const signature = parsed.searchParams.get('signature')!;
    expect(expires).toBe(Math.floor(new Date(expiresAt).getTime() / 1000));
    expect(verifyDocumentSignature('11111111-1111-4111-8111-111111111111', expires, signature)).toBe(true);
  });

  it('rejects tampered signatures and other documents', () => {
    const { url } = createSignedDocumentUrl('11111111-1111-4111-8111-111111111111');
    const parsed = new URL(url);
    const expires = Number(parsed.searchParams.get('expires'));
    const signature = parsed.searchParams.get('signature')!;
    expect(verifyDocumentSignature('22222222-2222-4222-8222-222222222222', expires, signature)).toBe(false);
    expect(verifyDocumentSignature('11111111-1111-4111-8111-111111111111', expires, `${signature}x`)).toBe(false);
  });

  it('rejects expired links', () => {
    const documentId = '11111111-1111-4111-8111-111111111111';
    const past = Math.floor(Date.now() / 1000) - 10;
    // Signature creation is internal; reusing a fresh URL with a past expiry must fail.
    const { url } = createSignedDocumentUrl(documentId);
    const signature = new URL(url).searchParams.get('signature')!;
    expect(verifyDocumentSignature(documentId, past, signature)).toBe(false);
  });
});

describe('password and security answer hashing', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('CorrectHorse1!');
    expect(hash).not.toContain('CorrectHorse1!');
    expect(await verifyPassword(hash, 'CorrectHorse1!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('normalizes security answers before hashing', async () => {
    const hash = await hashSecurityAnswer('  Blue  House ');
    expect(normalizeSecurityAnswer(' blue house ')).toBe('blue house');
    expect(await verifySecurityAnswer(hash, 'BLUE HOUSE')).toBe(true);
    expect(await verifySecurityAnswer(hash, 'Red House')).toBe(false);
  });
});
