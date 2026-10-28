import { createHash, randomBytes } from 'node:crypto';
import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

const PASSWORD_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, PASSWORD_OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hashValue, password);
  } catch {
    return false;
  }
}

/** Normalises security answers so casing/whitespace do not break verification. */
export function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function hashSecurityAnswer(answer: string): Promise<string> {
  return hashPassword(normalizeSecurityAnswer(answer));
}

export async function verifySecurityAnswer(hashValue: string, answer: string): Promise<boolean> {
  return verifyPassword(hashValue, normalizeSecurityAnswer(answer));
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateTemporaryPassword(): string {
  // Alphanumeric + symbol, avoids ambiguous characters.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const pick = () => alphabet[randomBytes(1)[0]! % alphabet.length]!;
  let body = '';
  for (let i = 0; i < 14; i += 1) body += pick();
  return `${body}!7aA`;
}
