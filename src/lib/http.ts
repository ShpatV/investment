import type { output, ZodType } from 'zod';
import { AppError } from './errors';

export function parseWith<S extends ZodType>(schema: S, value: unknown, label = 'request'): output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw AppError.validation(`Invalid ${label}`, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  }
  return result.data;
}

export const parseBody = <S extends ZodType>(schema: S, body: unknown) =>
  parseWith(schema, body, 'payload');
export const parseQuery = <S extends ZodType>(schema: S, query: unknown) =>
  parseWith(schema, query, 'query');

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** Applies pagination defaults so callers never have to re-check optional fields. */
export function pageParams(query: PageQuery, defaultPageSize = 20) {
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : defaultPageSize;
  return { page, pageSize };
}

export function paginationArgs(query: PageQuery, defaultPageSize = 20) {
  const { page, pageSize } = pageParams(query, defaultPageSize);
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function paginated<T>(data: T[], total: number, query: PageQuery, defaultPageSize = 20) {
  const { page, pageSize } = pageParams(query, defaultPageSize);
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export function toDate(value: string | Date, field = 'date'): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.validation(`Invalid ${field}`);
  }
  return date;
}

export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
