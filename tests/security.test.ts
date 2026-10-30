import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { createSignedDocumentUrl, verifyDocumentSignature } from '../src/lib/signed-url';
import { dateOnlySchema, decimalStringSchema, moneyAmountSchema } from '../src/lib/schemas';
import { sanitizeAuditData } from '../src/lib/audit';
import { assertFileSignature } from '../src/lib/storage';
import { hashSecurityAnswer, hashPassword, normalizeSecurityAnswer, verifyPassword, verifySecurityAnswer } from '../src/lib/passwords';

describe('upload content sniffing', () => {
  it('rejects files whose bytes contradict the declared MIME type', () => {
    expect(() => assertFileSignature(Buffer.from('<script>alert(1)</script>'), 'application/pdf')).toThrow();
    expect(() => assertFileSignature(Buffer.from('not a png'), 'image/png')).toThrow();
  });

  it('accepts files with a matching signature and unverifiable text formats', () => {
    expect(() => assertFileSignature(Buffer.from('%PDF-1.7\n'), 'application/pdf')).not.toThrow();
    expect(() => assertFileSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png')).not.toThrow();
    expect(() => assertFileSignature(Buffer.from('a,b\n1,2'), 'text/csv')).not.toThrow();
  });
});

describe('audit snapshots', () => {
  it('serializes Prisma decimals and redacts secrets', () => {
    const snapshot = sanitizeAuditData({
      amount: new Prisma.Decimal('123.45'),
      password: 'plain-text',
      nested: { tokenHash: 'abc' },
    });
    expect(snapshot).toEqual({
      amount: '123.45',
      password: '[redacted]',
      nested: { tokenHash: '[redacted]' },
    });
  });
});

describe('input schema hardening', () => {
  it('rejects impossible calendar dates', () => {
    expect(dateOnlySchema.safeParse('2026-02-31').success).toBe(false);
    expect(dateOnlySchema.safeParse('2026-13-01').success).toBe(false);
    expect(dateOnlySchema.safeParse('2024-02-29').success).toBe(true);
  });

  it('bounds decimal precision to the storage capacity', () => {
    expect(decimalStringSchema.safeParse('1'.repeat(19)).success).toBe(false);
    expect(decimalStringSchema.safeParse('1.23456').success).toBe(false);
    expect(decimalStringSchema.safeParse('123456789012345678.1234').success).toBe(true);
  });

  it('rejects sub-cent money values', () => {
    expect(moneyAmountSchema.safeParse('1.234').success).toBe(false);
    expect(moneyAmountSchema.safeParse('1.23').success).toBe(true);
  });
});

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
