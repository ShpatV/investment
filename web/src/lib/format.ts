import type {
  Commodity,
  CompoundingFrequency,
  DocumentCategory,
  DocumentStatus,
  InvestmentStatus,
  PriceStatus,
  TransactionStatus,
  TransactionType,
  UserStatus,
} from "./api/types";

/* --------------------------------------------------------------- money */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** All platform amounts are USD. */
export function usd(value: number | null | undefined, fractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (fractionDigits === 0) return usdCompactFormatter.format(value);
  return usdFormatter.format(value);
}

export function pct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/* --------------------------------------------------------------- dates */

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `datetime-local` input value from an ISO timestamp. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

/* --------------------------------------------------------------- labels */

export const investmentStatusLabel: Record<InvestmentStatus, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  MATURED: "Matured",
  CLOSED: "Closed",
};

export const compoundingLabel: Record<CompoundingFrequency, string> = {
  SIMPLE: "Simple",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMIANNUALLY: "Semi-annual",
  ANNUALLY: "Annual",
};

export const transactionTypeLabel: Record<TransactionType, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  INTEREST: "Interest",
};

export const transactionStatusLabel: Record<TransactionStatus, string> = {
  COMPLETED: "Completed",
  PENDING: "Pending",
  FAILED: "Failed",
};

export const documentCategoryLabel: Record<DocumentCategory, string> = {
  IDENTIFICATION: "Identification",
  INVESTMENT_AGREEMENT: "Investment agreement",
  STATEMENT: "Statement",
  TAX_DOCUMENT: "Tax document",
  OTHER: "Other",
};

export const documentStatusLabel: Record<DocumentStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const userStatusLabel: Record<UserStatus, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
};

export const priceStatusLabel: Record<PriceStatus, string> = {
  LIVE: "Live",
  STALE: "Stale",
  MANUAL_OVERRIDE: "Manual override",
  UNAVAILABLE: "Unavailable",
};

export const commodityLabel: Record<Commodity, string> = {
  GOLD: "Gold",
  OIL: "Oil",
};

export const commodityUnit: Record<Commodity, string> = {
  GOLD: "troy ounce",
  OIL: "barrel",
};

/** Title-cases a raw audit action such as `PRICE_OVERRIDE` → `Price override`. */
export function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function clientName(user: { firstName: string; lastName: string } | null | undefined): string {
  if (!user) return "—";
  return `${user.firstName} ${user.lastName}`.trim();
}

/** Formats a signed transaction amount: withdrawals render negative. */
export function signedAmount(type: TransactionType, amount: number): string {
  return `${type === "WITHDRAWAL" ? "−" : "+"}${usd(amount)}`;
}
