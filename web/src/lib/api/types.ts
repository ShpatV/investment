/**
 * Types mirroring the backend serializers (`src/lib/serializers.ts`).
 * Amounts arrive as JSON numbers rounded to two decimals; rates as percentages.
 */

export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";
export type UserStatus = "ACTIVE" | "DISABLED";
export type InstitutionStatus = "ACTIVE" | "DISABLED";

export type InvestmentStatus = "ACTIVE" | "PENDING" | "MATURED" | "CLOSED";
export type CompoundingFrequency =
  | "SIMPLE"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUALLY"
  | "ANNUALLY";

export type TransactionType = "DEPOSIT" | "WITHDRAWAL" | "INTEREST";
export type TransactionStatus = "COMPLETED" | "PENDING" | "FAILED";

export type DocumentCategory =
  | "IDENTIFICATION"
  | "INVESTMENT_AGREEMENT"
  | "STATEMENT"
  | "TAX_DOCUMENT"
  | "OTHER";
export type DocumentStatus = "ACTIVE" | "ARCHIVED";

export type AssignmentStatus = "ACTIVE" | "REPLACED" | "REMOVED";
export type Commodity = "GOLD" | "OIL";
export type PriceStatus = "LIVE" | "STALE" | "MANUAL_OVERRIDE" | "UNAVAILABLE";
export type AuditOutcome = "SUCCESS" | "FAILURE";
export type Currency = "USD";

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface UserRef {
  id: string;
  fullName: string;
  email?: string;
  status?: UserStatus;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  securityQuestion: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Advisor {
  id: string;
  fullName: string;
  email: string;
}

export interface Profile extends User {
  advisor: (Advisor & { phone?: string | null }) | null;
}

export interface AuthUser extends User {
  advisor: Advisor | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: "Bearer";
  portal?: "client" | "admin" | "super-admin";
}

export interface ClientListItem extends User {
  assignedAdmin:
    | {
        id: string;
        fullName: string;
        email: string;
        assignedAt: string;
      }
    | null;
  investmentCount: number;
  totalInvestedPrincipal: number;
  lastActivityAt: string | null;
}

export interface ClientDetail extends User {
  advisor:
    | {
        id: string;
        fullName: string;
        email: string;
        phone: string | null;
        assignedAt: string;
      }
    | null;
  portfolioSummary: PortfolioSummary;
  investments: Investment[];
  recentTransactions: Transaction[];
  recentDocuments: Document[];
  unreadNotifications: number;
  lastUpdatedAt: string;
  memberSince: string;
}

export interface Institution {
  id: string;
  name: string;
  description: string | null;
  status: InstitutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Investment {
  id: string;
  clientId: string;
  client?: UserRef;
  institution?: { id: string; name: string };
  institutionId: string;
  name: string;
  principalAmount: number;
  currentPrincipal: number;
  currency: Currency;
  annualInterestRate: number;
  compoundingFrequency: CompoundingFrequency;
  interestCalculationMethod: "SIMPLE_INTEREST" | "COMPOUND_INTEREST";
  startDate: string;
  maturityDate: string;
  termYears: number | null;
  projectedReturn: number | null;
  projectedMaturityBalance: number | null;
  status: InvestmentStatus;
  notes: string | null;
  calculationMethodology: string | null;
  lastUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  clientId: string;
  client?: { id: string; fullName: string };
  investmentId: string | null;
  investment: { id: string; name: string } | null;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description: string | null;
  status: TransactionStatus;
  affectsPrincipal: boolean;
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  clientId: string;
  client?: { id: string; fullName: string };
  investmentId: string | null;
  title: string;
  category: DocumentCategory;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string | null;
  status: DocumentStatus;
  uploadedBy: { id: string; fullName: string } | null;
  uploadedAt: string;
  archivedAt: string | null;
  updatedAt: string;
}

export interface AdminAssignment {
  id: string;
  clientId: string;
  client?: UserRef;
  adminId: string;
  admin?: UserRef;
  assignedBy: { id: string; fullName: string } | null;
  assignedAt: string;
  endedAt: string | null;
  status: AssignmentStatus;
  notes: string | null;
}

export interface AdminListItem extends User {
  assignedClientCount: number;
}

export interface Price {
  id: string;
  commodity: Commodity;
  price: number | null;
  currency: Currency;
  unit: string;
  provider: string;
  providerPrice: number | null;
  providerFetchedAt: string | null;
  manualOverridePrice: number | null;
  overrideReason: string | null;
  overrideStartsAt: string | null;
  overrideEndsAt: string | null;
  lastPublishedAt: string | null;
  status: PriceStatus;
  source: string;
  updatedAt: string;
}

export interface PriceList {
  prices: Price[];
  primaryProvider: string;
  activeProviders: string[];
  staleAfterMinutes: number;
  canOverride: boolean;
  notes?: string;
}

export interface PriceOverride {
  id: string;
  commodity: Commodity;
  previousPrice: number | null;
  newPrice: number;
  currency: Currency;
  unit: string;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  clearedAt: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface PriceSnapshot {
  id: string;
  price: number;
  currency: Currency;
  unit: string;
  provider: string;
  fetchedAt: string;
}

export interface PriceHistory {
  overrides: PriceOverride[];
  snapshots: PriceSnapshot[];
}

export interface PriceDetail extends Price {
  meta: { label: string; unit: string; currency: string; symbol: string; yahooSymbol: string };
}

export interface PriceRefreshResult {
  commodity: Commodity;
  success: boolean;
  price?: number;
  provider?: string;
  error?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: { id: string; fullName: string; email: string } | null;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  clientId: string | null;
  summary: string | null;
  beforeData: unknown;
  afterData: unknown;
  outcome: AuditOutcome;
  ipAddress: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPage extends Paginated<Notification> {
  unreadCount: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string | null;
  imageUrl: string | null;
}

export interface NewsResult {
  status: "ok" | "stale" | "unavailable" | "unconfigured";
  provider: string;
  articles: NewsArticle[];
  fetchedAt: string | null;
  cached: boolean;
  message?: string;
}

export interface AllocationSlice {
  institutionId: string;
  institutionName: string;
  amount: number;
  percentage: number;
}

export interface PortfolioSummary {
  totalInvested: number;
  projectedMaturityBalance: number;
  projectedReturn: number;
  averageInterestRate: number;
  activeInvestments: number;
  allocation: AllocationSlice[];
}

export interface InvestmentProjectionView {
  currentPrincipal: number;
  projectedMaturityBalance: number;
  projectedReturn: number;
  annualInterestRate: number;
  termYears: number;
  remainingTermYears: number;
  isMatured: boolean;
  methodology: string;
  asOf: string;
}

export interface ClientDashboard {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    memberSince: string;
  };
  summary: PortfolioSummary;
  allocation: PortfolioSummary["allocation"];
  asOf: string;
  portfolio: Investment[];
  recentActivity: Transaction[];
  planning: {
    nextMaturityDate: string | null;
    estimatedFutureBalance: number;
    estimatedEarnings: number;
    timeline: Array<{
      investmentId: string;
      name: string;
      maturityDate: string;
      daysRemaining: number;
      projectedMaturityBalance: number;
    }>;
    upcomingMaturities: Array<Investment & { daysRemaining: number }>;
  };
  unreadNotifications: number;
  assumptions: {
    dayCount: string;
    rounding: string;
    projectionDisclaimer: string;
  };
}

export interface AdminDashboard {
  scope: "SYSTEM" | "ASSIGNED_CLIENTS";
  role: Role;
  asOf: string;
  metrics: {
    totalUsers: number;
    totalClients: number;
    activeClients: number;
    totalAdmins: number;
    totalInvestments: number;
    aum: number;
    unreadItems: number;
  };
  definitions: Record<string, string>;
  recentTransactions: Transaction[];
  recentlyAddedClients: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: UserStatus;
    createdAt: string;
  }>;
  recentInvestmentUpdates: Investment[];
  upcomingMaturities: Array<Investment & { daysRemaining: number }>;
  recentDocuments: Document[];
  recentAudit: AuditEntry[];
  prices: Price[];
}

export interface EffectivePermissions {
  role: Role;
  canManageAdmins: boolean;
  canManageAssignments: boolean;
  canOverridePrices: boolean;
  canManageSettings: boolean;
  allowAdminSelfAssign: boolean;
  allowAdminPriceOverride: boolean;
  maturityReminderDays: number;
}

export type SettingsMap = Record<string, unknown>;

export interface SecurityQuestion {
  email: string;
  securityQuestion: string | null;
}

/* ---------- request payloads ---------- */

export interface LoginInput {
  email: string;
  password: string;
}

export interface ClientCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string | null;
  dateOfBirth?: string | null;
  assignedAdminId?: string;
  initialPassword?: string;
  notes?: string;
}

export type ClientUpdateInput = Partial<
  Pick<ClientCreateInput, "firstName" | "lastName" | "email" | "phone" | "address" | "dateOfBirth" | "notes">
> & { status?: UserStatus };

export interface AdminCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: "ADMIN" | "SUPER_ADMIN";
  initialPassword?: string;
}

export interface AdminUpdateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: "ADMIN" | "SUPER_ADMIN";
}

export interface InvestmentCreateInput {
  clientId: string;
  institutionId: string;
  name: string;
  principalAmount: string | number;
  currency?: Currency;
  annualInterestRate: string | number;
  compoundingFrequency: CompoundingFrequency;
  startDate: string;
  maturityDate: string;
  status?: InvestmentStatus;
  notes?: string;
}

export type InvestmentUpdateInput = Partial<
  Omit<InvestmentCreateInput, "clientId" | "currency">
> & { currency?: Currency };

export interface TransactionCreateInput {
  clientId: string;
  investmentId?: string;
  type: TransactionType;
  amount: string | number;
  currency?: Currency;
  description?: string;
  status?: TransactionStatus;
  affectsPrincipal?: boolean;
  transactionDate: string;
  idempotencyKey?: string;
}

export interface TransactionUpdateInput {
  investmentId?: string | null;
  type?: TransactionType;
  amount?: string | number;
  description?: string;
  status?: TransactionStatus;
  affectsPrincipal?: boolean;
  transactionDate?: string;
}

export interface DocumentUploadInput {
  file: File;
  title: string;
  category: DocumentCategory;
  clientId?: string;
  investmentId?: string;
  description?: string;
}

export interface AssignmentCreateInput {
  clientId: string;
  adminId: string;
  notes?: string;
}

export interface AssignmentUpdateInput {
  adminId?: string;
  status?: "ACTIVE" | "REMOVED";
  notes?: string;
}

export interface PriceOverrideInput {
  price: string | number;
  currency?: Currency;
  unit?: string;
  reason: string;
  startsAt?: string;
  endsAt?: string | null;
}

export interface ProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string | null;
  dateOfBirth?: string | null;
}
