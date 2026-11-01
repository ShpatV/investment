import { requestData, requestPage, request, type PortalName, type QueryValue } from "./client";
import type {
  AdminAssignment,
  AdminCreateInput,
  AdminDashboard,
  AdminListItem,
  AdminUpdateInput,
  AssignmentCreateInput,
  AssignmentUpdateInput,
  AuditEntry,
  AuthSession,
  AuthUser,
  ClientCreateInput,
  ClientDashboard,
  ClientDetail,
  ClientListItem,
  ClientUpdateInput,
  Commodity,
  Document,
  DocumentUploadInput,
  EffectivePermissions,
  Institution,
  Investment,
  InvestmentCreateInput,
  InvestmentUpdateInput,
  LoginInput,
  NewsResult,
  Notification,
  NotificationPage,
  Price,
  PriceDetail,
  PriceHistory,
  PriceList,
  PriceOverride,
  PriceOverrideInput,
  PriceRefreshResult,
  Profile,
  ProfileUpdateInput,
  SettingsMap,
  Transaction,
  TransactionCreateInput,
  TransactionUpdateInput,
  Pagination,
} from "./types";

type Page<T> = { data: T[]; pagination: Pagination };

/* ------------------------------------------------------------------ auth */

export const authApi = {
  login: (portal: PortalName, input: LoginInput) =>
    requestData<AuthSession>(`/auth/login/${portal}`, { method: "POST", body: input, auth: false }),

  logout: (refreshToken: string) =>
    request("/auth/logout", { method: "POST", body: { refreshToken }, auth: false }),

  me: () => requestData<AuthUser & { unreadNotifications: number }>("/auth/me"),

  profile: () => requestData<Profile>("/profile"),

  updateProfile: (input: ProfileUpdateInput) =>
    requestData<Profile>("/profile", { method: "PATCH", body: input }),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    requestData<{ message: string }>("/auth/change-password", { method: "POST", body: input }),

  forgotPassword: (email: string) =>
    requestData<{ message: string; devToken?: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
      auth: false,
    }),

  resetPassword: (input: { token: string; newPassword: string }) =>
    requestData<{ message: string }>("/auth/reset-password", { method: "POST", body: input, auth: false }),

  securityQuestion: () =>
    requestData<{ securityQuestion: string | null }>("/auth/security-question"),

  updateSecurityQuestion: (input: {
    securityQuestion: string;
    securityAnswer: string;
    currentPassword: string;
  }) => requestData<{ message: string }>("/auth/security-question", { method: "PATCH", body: input }),
};

/* --------------------------------------------------------------- clients */

export interface ClientListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "ACTIVE" | "DISABLED";
  adminId?: string;
  sortBy?: "createdAt" | "firstName" | "lastName";
  sortDir?: "asc" | "desc";
}

export const clientsApi = {
  list: (query: ClientListQuery = {}): Promise<Page<ClientListItem>> =>
    requestPage<ClientListItem>("/clients", { query: query as Record<string, QueryValue> }),

  get: (id: string) => requestData<ClientDetail>(`/clients/${id}`),

  create: (input: ClientCreateInput) =>
    requestData<ClientListItem & { invitation?: { expiresAt: string; delivery: string; token?: string } }>(
      "/clients",
      { method: "POST", body: input },
    ),

  update: (id: string, input: ClientUpdateInput) =>
    requestData<ClientListItem>(`/clients/${id}`, { method: "PATCH", body: input }),

  invite: (id: string) =>
    requestData<{ expiresAt: string; delivery: string; token?: string }>(`/clients/${id}/invite`, {
      method: "POST",
    }),

  disable: (id: string) => requestData<ClientListItem>(`/clients/${id}/disable`, { method: "POST" }),

  reactivate: (id: string) =>
    requestData<ClientListItem>(`/clients/${id}/reactivate`, { method: "POST" }),
};

/* ---------------------------------------------------------------- admins */

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "ACTIVE" | "DISABLED";
  role?: "ADMIN" | "SUPER_ADMIN";
}

export const adminsApi = {
  list: (query: AdminListQuery = {}): Promise<Page<AdminListItem>> =>
    requestPage<AdminListItem>("/admins", { query: query as Record<string, QueryValue> }),

  get: (id: string) => requestData<AdminListItem>(`/admins/${id}`),

  create: (input: AdminCreateInput) =>
    requestData<AdminListItem & { invitation?: { expiresAt: string; delivery: string; token?: string } }>(
      "/admins",
      { method: "POST", body: input },
    ),

  update: (id: string, input: AdminUpdateInput) =>
    requestData<AdminListItem>(`/admins/${id}`, { method: "PATCH", body: input }),

  disable: (id: string) => requestData<AdminListItem>(`/admins/${id}/disable`, { method: "POST" }),

  reactivate: (id: string) => requestData<AdminListItem>(`/admins/${id}/reactivate`, { method: "POST" }),

  clients: (id: string, query: { page?: number; pageSize?: number } = {}) =>
    requestPage<ClientListItem & { assignedAt: string | null }>(`/admins/${id}/clients`, {
      query: query as Record<string, QueryValue>,
    }),
};

/* ----------------------------------------------------------- assignments */

export interface AssignmentListQuery {
  page?: number;
  pageSize?: number;
  clientId?: string;
  adminId?: string;
  status?: "ACTIVE" | "REPLACED" | "REMOVED";
}

export const assignmentsApi = {
  list: (query: AssignmentListQuery = {}): Promise<Page<AdminAssignment>> =>
    requestPage<AdminAssignment>("/assignments", { query: query as Record<string, QueryValue> }),

  unassigned: (query: { page?: number; pageSize?: number; search?: string } = {}) =>
    requestPage<import("./types").User>("/assignments/unassigned", {
      query: query as Record<string, QueryValue>,
    }),

  get: (id: string) => requestData<AdminAssignment>(`/assignments/${id}`),

  create: (input: AssignmentCreateInput) =>
    requestData<AdminAssignment>("/assignments", { method: "POST", body: input }),

  update: (id: string, input: AssignmentUpdateInput) =>
    requestData<AdminAssignment>(`/assignments/${id}`, { method: "PATCH", body: input }),

  remove: (id: string) => request(`/assignments/${id}`, { method: "DELETE" }),
};

/* ---------------------------------------------------------- institutions */

export interface InstitutionListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "ACTIVE" | "DISABLED";
}

export const institutionsApi = {
  list: (query: InstitutionListQuery = {}): Promise<Page<Institution>> =>
    requestPage<Institution>("/institutions", { query: query as Record<string, QueryValue> }),

  create: (input: { name: string; description?: string | null }) =>
    requestData<Institution>("/institutions", { method: "POST", body: input }),

  update: (id: string, input: { name?: string; description?: string | null; status?: "ACTIVE" | "DISABLED" }) =>
    requestData<Institution>(`/institutions/${id}`, { method: "PATCH", body: input }),

  remove: (id: string) => request(`/institutions/${id}`, { method: "DELETE" }),
};

/* ----------------------------------------------------------- investments */

export interface InvestmentListQuery {
  page?: number;
  pageSize?: number;
  clientId?: string;
  institutionId?: string;
  status?: "ACTIVE" | "PENDING" | "MATURED" | "CLOSED";
  search?: string;
  sortBy?: "createdAt" | "startDate" | "maturityDate" | "name";
  sortDir?: "asc" | "desc";
}

export const investmentsApi = {
  list: (query: InvestmentListQuery = {}): Promise<Page<Investment>> =>
    requestPage<Investment>("/investments", { query: query as Record<string, QueryValue> }),

  get: (id: string) => requestData<Investment>(`/investments/${id}`),

  create: (input: InvestmentCreateInput) =>
    requestData<Investment>("/investments", { method: "POST", body: input }),

  update: (id: string, input: InvestmentUpdateInput) =>
    requestData<Investment>(`/investments/${id}`, { method: "PATCH", body: input }),
};

/* ---------------------------------------------------------- transactions */

export interface TransactionListQuery {
  page?: number;
  pageSize?: number;
  clientId?: string;
  investmentId?: string;
  type?: "DEPOSIT" | "WITHDRAWAL" | "INTEREST";
  status?: "COMPLETED" | "PENDING" | "FAILED";
  search?: string;
  from?: string;
  to?: string;
}

export const transactionsApi = {
  list: (query: TransactionListQuery = {}): Promise<Page<Transaction>> =>
    requestPage<Transaction>("/transactions", { query: query as Record<string, QueryValue> }),

  get: (id: string) => requestData<Transaction>(`/transactions/${id}`),

  create: (input: TransactionCreateInput) =>
    requestData<Transaction>("/transactions", {
      method: "POST",
      body: input,
      ...(input.idempotencyKey
        ? { headers: { "idempotency-key": input.idempotencyKey } }
        : {}),
    }),

  update: (id: string, input: TransactionUpdateInput) =>
    requestData<Transaction>(`/transactions/${id}`, { method: "PATCH", body: input }),
};

/* ------------------------------------------------------------- documents */

export interface DocumentListQuery {
  page?: number;
  pageSize?: number;
  clientId?: string;
  investmentId?: string;
  category?: string;
  status?: "ACTIVE" | "ARCHIVED";
  search?: string;
}

export const documentsApi = {
  list: (query: DocumentListQuery = {}): Promise<Page<Document>> =>
    requestPage<Document>("/documents", { query: query as Record<string, QueryValue> }),

  get: (id: string) => requestData<Document>(`/documents/${id}`),

  upload: (input: DocumentUploadInput) => {
    const form = new FormData();
    // Text fields must precede the file: Fastify populates `file.fields`
    // from parts that streamed before the file part.
    form.append("title", input.title);
    form.append("category", input.category);
    if (input.clientId) form.append("clientId", input.clientId);
    if (input.investmentId) form.append("investmentId", input.investmentId);
    if (input.description) form.append("description", input.description);
    form.append("file", input.file, input.file.name);
    return requestData<Document>("/documents", { method: "POST", formData: form });
  },

  archive: (id: string) => requestData<null>(`/documents/${id}/archive`, { method: "POST" }),

  remove: (id: string) => requestData<null>(`/documents/${id}`, { method: "DELETE" }),

  signedUrl: (id: string) =>
    requestData<{ url: string; expiresAt: string }>(`/documents/${id}/signed-url`),
};

/* ------------------------------------------------------------ dashboards */

export const dashboardApi = {
  client: (clientId?: string) =>
    requestData<ClientDashboard>("/dashboard/client", {
      query: clientId ? { clientId } : {},
    }),

  admin: () => requestData<AdminDashboard>("/dashboard/admin"),
};

/* ---------------------------------------------------------------- prices */

export const pricesApi = {
  list: () => requestData<PriceList>("/prices"),

  get: (commodity: Commodity) => requestData<PriceDetail>(`/prices/${commodity}`),

  history: (commodity: Commodity) =>
    requestData<PriceHistory>(`/prices/${commodity}/history`),

  refresh: () =>
    requestData<{ results: PriceRefreshResult[]; prices: Price[] }>("/prices/refresh", {
      method: "POST",
    }),

  override: (commodity: Commodity, input: PriceOverrideInput) =>
    requestData<{ price: Price; overrideId: string }>(`/prices/${commodity}/override`, {
      method: "POST",
      body: input,
    }),

  clearOverride: (commodity: Commodity) =>
    requestData<{ price: Price; cleared: boolean }>(`/prices/${commodity}/override`, { method: "DELETE" }),
};

/* ------------------------------------------------------------------ news */

export const newsApi = {
  list: (limit = 12) => requestData<NewsResult>("/news", { query: { limit } }),
};

/* --------------------------------------------------------- notifications */

export const notificationsApi = {
  list: (query: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}) =>
    requestPage<Notification>("/notifications", {
      query: query as Record<string, QueryValue>,
    }) as Promise<Page<Notification> & { unreadCount: number }>,

  markRead: (id: string) =>
    requestData<Notification>(`/notifications/${id}/read`, { method: "PATCH" }),

  readAll: () => requestData<{ updated: number }>("/notifications/read-all", { method: "POST" }),
};

/* ----------------------------------------------------------------- audit */

export interface AuditListQuery {
  page?: number;
  pageSize?: number;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  clientId?: string;
  outcome?: "SUCCESS" | "FAILURE";
  actorRole?: "USER" | "ADMIN" | "SUPER_ADMIN";
  from?: string;
  to?: string;
  search?: string;
}

export const auditApi = {
  list: (query: AuditListQuery = {}): Promise<Page<AuditEntry>> =>
    requestPage<AuditEntry>("/audit-logs", { query: query as Record<string, QueryValue> }),

  get: (id: string) => requestData<AuditEntry>(`/audit-logs/${id}`),
};

/* -------------------------------------------------------------- settings */

export const settingsApi = {
  all: () => requestData<{ settings: SettingsMap; editableKeys: string[] }>("/settings"),

  effective: () => requestData<EffectivePermissions>("/settings/effective"),

  update: (input: {
    allowAdminSelfAssign?: boolean;
    allowAdminPriceOverride?: boolean;
    maturityReminderDays?: number;
  }) => requestData<{ settings: SettingsMap }>("/settings", { method: "PATCH", body: input }),
};

export type { Page, NotificationPage };
