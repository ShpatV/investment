import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  // Node >= 20.12 supports loading .env files natively (no dotenv dependency).
  process.loadEnvFile(envFile);
}

const boolFromString = z
  .string()
  .optional()
  .transform((value) => value === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()));

const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());
const optionalEmail = z.preprocess(blankToUndefined, z.string().trim().email().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.string().trim().optional(),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  EXPOSE_DEV_TOKENS: boolFromString,

  STORAGE_DIR: z.string().default('./storage/documents'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),

  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: boolFromString,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_REJECT_UNAUTHORIZED: boolFromString,
  MAIL_FROM: optionalEmail,
  MAIL_FROM_NAME: z.string().trim().min(1).max(120).default('Investment Platform'),
  CLIENT_APP_URL: z.preprocess(blankToUndefined, z.string().url().default('http://localhost:5173')),
  ADMIN_APP_URL: z.preprocess(blankToUndefined, z.string().url().default('http://localhost:5174')),
  MAIL_INVITE_PATH: z.preprocess(blankToUndefined, z.string().trim().startsWith('/').default('/accept-invitation')),
  MAIL_RESET_PATH: z.preprocess(blankToUndefined, z.string().trim().startsWith('/').default('/reset-password')),

  PRICE_PROVIDER: z.enum(['stooq', 'none']).default('stooq'),
  PRICE_REFRESH_CRON: z.string().default('*/15 * * * *'),
  PRICE_STALE_MINUTES: z.coerce.number().int().min(1).default(60),
  ALLOW_ADMIN_PRICE_OVERRIDE: boolFromString,

  NEWS_PROVIDER: z.enum(['newsapi', 'none']).default('newsapi'),
  NEWS_API_KEY: z.string().optional(),
  NEWS_CACHE_MINUTES: z.coerce.number().int().min(1).default(15),
  NEWS_QUERY: z.string().default('gold OR oil OR commodities'),

  SEED_SUPER_ADMIN_EMAIL: z.string().email().default('superadmin@example.com'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(10).default('SuperAdmin123!'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: z.string().min(10).default('Admin1234!'),
  SEED_CLIENT_EMAIL: z.string().email().default('client@example.com'),
  SEED_CLIENT_PASSWORD: z.string().min(10).default('Client1234!'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.`);
}

const env = parsed.data;

const smtpConfigured = Boolean(env.SMTP_HOST);
if (smtpConfigured && !env.MAIL_FROM) {
  throw new Error('MAIL_FROM must be set when SMTP_HOST is configured (for example "no-reply@yourdomain.com").');
}
if (smtpConfigured && env.SMTP_USER && env.SMTP_PASS === undefined) {
  throw new Error('SMTP_PASS must be set when SMTP_USER is configured.');
}

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

/**
 * Fastify accepts a boolean, an address/CIDR string, or a trust function.
 * A numeric value is treated as a hop count (1 = one reverse proxy).
 * Default is `false`: trusting X-Forwarded-For when the API is directly exposed
 * would let clients spoof their IP and bypass per-IP rate limits.
 */
function parseTrustProxy(
  value: string | undefined,
): boolean | string | ((address: string, hop: number) => boolean) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (['true', 'yes', 'on'].includes(normalized)) return true;
  if (['false', 'no', 'off', '0'].includes(normalized)) return false;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops > 0) return (_address, hop) => hop < hops;
  return value;
}

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  host: env.HOST,
  port: env.PORT,
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ''),
  corsOrigins: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
  logLevel: env.LOG_LEVEL,
  trustProxy: parseTrustProxy(env.TRUST_PROXY),

  databaseUrl: env.DATABASE_URL,

  jwtSecret: env.JWT_SECRET,
  jwtAccessTtl: env.JWT_ACCESS_TTL,
  refreshTokenDays: env.REFRESH_TOKEN_DAYS,
  exposeDevTokens: env.EXPOSE_DEV_TOKENS ?? env.NODE_ENV !== 'production',

  storageDir: resolve(process.cwd(), env.STORAGE_DIR),
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,

  mail: {
    enabled: smtpConfigured,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED ?? true,
    from: env.MAIL_FROM,
    fromName: env.MAIL_FROM_NAME,
    clientAppUrl: trimTrailingSlash(env.CLIENT_APP_URL),
    adminAppUrl: trimTrailingSlash(env.ADMIN_APP_URL),
    invitePath: env.MAIL_INVITE_PATH,
    resetPath: env.MAIL_RESET_PATH,
  },

  priceProvider: env.PRICE_PROVIDER,
  priceRefreshCron: env.PRICE_REFRESH_CRON,
  priceStaleMinutes: env.PRICE_STALE_MINUTES,
  allowAdminPriceOverride: env.ALLOW_ADMIN_PRICE_OVERRIDE ?? false,

  newsProvider: env.NEWS_PROVIDER,
  newsApiKey: env.NEWS_API_KEY,
  newsCacheMinutes: env.NEWS_CACHE_MINUTES,
  newsQuery: env.NEWS_QUERY,

  seed: {
    superAdminEmail: env.SEED_SUPER_ADMIN_EMAIL,
    superAdminPassword: env.SEED_SUPER_ADMIN_PASSWORD,
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    clientEmail: env.SEED_CLIENT_EMAIL,
    clientPassword: env.SEED_CLIENT_PASSWORD,
  },
};

export type AppConfig = typeof config;
