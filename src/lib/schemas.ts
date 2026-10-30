import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('A valid email address is required').max(255);

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const uuidSchema = z.string().uuid('A valid identifier is required');

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    // Round-trip check rejects impossible dates such as 2026-02-31, which
    // JavaScript would otherwise silently roll over to the next month.
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Date must be an ISO-8601 date-time' })
  .transform((value) => new Date(value));

export const optionalDateOnlySchema = dateOnlySchema.nullable().optional();

export const pageSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const currencySchema = z.literal('USD');
/**
 * Defaulted variant for create payloads. Keep the default out of
 * `currencySchema` itself: wrapping a defaulted schema with `.optional()`
 * still injects the default in Zod 4, which corrupts partial updates.
 */
export const currencyInputSchema = currencySchema.default('USD');

/**
 * Shared decimal input for money and rates. The database stores money as
 * Decimal(20,2), so this accepts at most 18 integer digits and 4 fractional
 * digits. Rejecting out-of-range values here turns what would otherwise be a
 * database overflow (HTTP 500) into a clear validation error.
 */
export const decimalStringSchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toString() : value))
  .refine(
    (value) => /^-?\d{1,18}(\.\d{1,4})?$/.test(value),
    'Must be a valid decimal with at most 18 integer and 4 fractional digits',
  );

/** Money values are stored with two decimal places; reject sub-cent precision. */
export const moneyAmountSchema = decimalStringSchema.refine(
  (value) => /^-?\d{1,18}(\.\d{1,2})?$/.test(value),
  'Amount must have at most 2 decimal places',
);

export const positiveAmountSchema = moneyAmountSchema.refine(
  (value) => Number(value) > 0,
  'Amount must be greater than zero',
);

export const trimmedOptional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const nullableOptional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const booleanQuery = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}, z.boolean().optional());
