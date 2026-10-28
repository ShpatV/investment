import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';

export const SETTING_KEYS = {
  allowAdminSelfAssign: 'assignments.allowAdminSelfAssign',
  allowAdminPriceOverride: 'prices.allowAdminOverride',
  maturityReminderDays: 'maturity.reminderDays',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const DEFAULTS: Record<string, Prisma.InputJsonValue> = {
  [SETTING_KEYS.allowAdminSelfAssign]: false,
  [SETTING_KEYS.allowAdminPriceOverride]: config.allowAdminPriceOverride,
  [SETTING_KEYS.maturityReminderDays]: 30,
};

export async function getSetting<T = Prisma.JsonValue>(key: string, fallback?: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (row) return row.value as T;
  if (fallback !== undefined) return fallback;
  return (DEFAULTS[key] as T) ?? (null as T);
}

export async function getBooleanSetting(key: string, fallback = false): Promise<boolean> {
  const value = await getSetting<unknown>(key, fallback);
  return value === true;
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const value = await getSetting<unknown>(key, fallback);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function setSetting(
  key: string,
  value: Prisma.InputJsonValue,
  updatedById?: string | null,
  description?: string,
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedById: updatedById ?? null, ...(description ? { description } : {}) },
    create: { key, value, updatedById: updatedById ?? null, description: description ?? null },
  });
}

export async function allSettings(): Promise<Record<string, Prisma.JsonValue>> {
  const rows = await prisma.systemSetting.findMany();
  const merged: Record<string, Prisma.JsonValue> = { ...(DEFAULTS as Record<string, Prisma.JsonValue>) };
  for (const row of rows) merged[row.key] = row.value;
  return merged;
}
