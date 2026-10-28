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
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), 'Invalid date');

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Date must be an ISO-8601 date-time' })
  .transform((value) => new Date(value));

export const optionalDateOnlySchema = dateOnlySchema.nullable().optional();

export const pageSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const currencySchema = z.literal('USD').default('USD');
export const decimalStringSchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toString() : value))
  .refine((value) => /^-?\d+(\.\d+)?$/.test(value), 'Must be a valid decimal number');

export const positiveAmountSchema = decimalStringSchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero');

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
