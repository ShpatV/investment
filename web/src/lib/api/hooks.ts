import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminsApi,
  assignmentsApi,
  auditApi,
  authApi,
  clientsApi,
  dashboardApi,
  documentsApi,
  institutionsApi,
  investmentsApi,
  newsApi,
  notificationsApi,
  pricesApi,
  settingsApi,
  transactionsApi,
  type AdminListQuery,
  type AssignmentListQuery,
  type AuditListQuery,
  type ClientListQuery,
  type DocumentListQuery,
  type InstitutionListQuery,
  type InvestmentListQuery,
  type TransactionListQuery,
} from "./endpoints";
import type {
  AdminCreateInput,
  AdminUpdateInput,
  AssignmentCreateInput,
  AssignmentUpdateInput,
  ClientCreateInput,
  ClientUpdateInput,
  Commodity,
  DocumentCategory,
  DocumentUploadInput,
  InvestmentCreateInput,
  InvestmentUpdateInput,
  PriceOverrideInput,
  ProfileUpdateInput,
  TransactionCreateInput,
  TransactionUpdateInput,
} from "./types";

export const queryKeys = {
  me: ["me"] as const,
  clientDashboard: (clientId?: string) => ["dashboard", "client", clientId ?? "self"] as const,
  adminDashboard: ["dashboard", "admin"] as const,
  clients: (query: ClientListQuery) => ["clients", query] as const,
  client: (id: string) => ["clients", id] as const,
  admins: (query: AdminListQuery) => ["admins", query] as const,
  admin: (id: string) => ["admins", id] as const,
  adminClients: (id: string, page: number) => ["admins", id, "clients", page] as const,
  assignments: (query: AssignmentListQuery) => ["assignments", query] as const,
  unassigned: (search: string) => ["assignments", "unassigned", search] as const,
  institutions: (query: InstitutionListQuery) => ["institutions", query] as const,
  investments: (query: InvestmentListQuery) => ["investments", query] as const,
  investment: (id: string) => ["investments", id] as const,
  transactions: (query: TransactionListQuery) => ["transactions", query] as const,
  documents: (query: DocumentListQuery) => ["documents", query] as const,
  prices: ["prices"] as const,
  priceHistory: (commodity: Commodity) => ["prices", commodity, "history"] as const,
  news: (limit: number) => ["news", limit] as const,
  audit: (query: AuditListQuery) => ["audit", query] as const,
  notifications: (query: Record<string, unknown>) => ["notifications", query] as const,
  settings: ["settings"] as const,
  effectivePermissions: ["settings", "effective"] as const,
};

function useInvalidateOnSuccess(keys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
  };
}

/* ------------------------------------------------------------ dashboards */

export function useClientDashboard(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.clientDashboard(clientId),
    queryFn: () => dashboardApi.client(clientId),
    staleTime: 30_000,
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: queryKeys.adminDashboard,
    queryFn: () => dashboardApi.admin(),
    staleTime: 30_000,
  });
}

/* --------------------------------------------------------------- clients */

export function useClients(query: ClientListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.clients(query),
    queryFn: () => clientsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.client(id ?? ""),
    queryFn: () => clientsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientCreateInput) => clientsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminDashboard });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientUpdateInput }) => clientsApi.update(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.client(variables.id) });
    },
  });
}

export function useInviteClient() {
  const invalidate = useInvalidateOnSuccess([["clients"]]);
  return useMutation({ mutationFn: (id: string) => clientsApi.invite(id), onSuccess: invalidate });
}

export function useToggleClient() {
  const invalidate = useInvalidateOnSuccess([["clients"], queryKeys.adminDashboard]);
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "disable" | "reactivate" }) =>
      action === "disable" ? clientsApi.disable(id) : clientsApi.reactivate(id),
    onSuccess: invalidate,
  });
}

/* ---------------------------------------------------------------- admins */

export function useAdmins(query: AdminListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.admins(query),
    queryFn: () => adminsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useAdminClients(adminId: string | undefined, page = 1) {
  return useQuery({
    queryKey: queryKeys.adminClients(adminId ?? "", page),
    queryFn: () => adminsApi.clients(adminId as string, { page }),
    enabled: Boolean(adminId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateAdmin() {
  const invalidate = useInvalidateOnSuccess([["admins"], queryKeys.adminDashboard]);
  return useMutation({ mutationFn: (input: AdminCreateInput) => adminsApi.create(input), onSuccess: invalidate });
}

export function useUpdateAdmin() {
  const invalidate = useInvalidateOnSuccess([["admins"]]);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUpdateInput }) => adminsApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useToggleAdmin() {
  const invalidate = useInvalidateOnSuccess([["admins"], queryKeys.adminDashboard]);
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "disable" | "reactivate" }) =>
      action === "disable" ? adminsApi.disable(id) : adminsApi.reactivate(id),
    onSuccess: invalidate,
  });
}

/* ----------------------------------------------------------- assignments */

export function useAssignments(query: AssignmentListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.assignments(query),
    queryFn: () => assignmentsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useUnassignedClients(search: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.unassigned(search),
    queryFn: () =>
      assignmentsApi.unassigned({ pageSize: 100, ...(search ? { search } : {}) }),
    enabled,
  });
}

export function useCreateAssignment() {
  const invalidate = useInvalidateOnSuccess([["assignments"], ["clients"]]);
  return useMutation({
    mutationFn: (input: AssignmentCreateInput) => assignmentsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAssignment() {
  const invalidate = useInvalidateOnSuccess([["assignments"], ["clients"]]);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignmentUpdateInput }) =>
      assignmentsApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useRemoveAssignment() {
  const invalidate = useInvalidateOnSuccess([["assignments"], ["clients"]]);
  return useMutation({ mutationFn: (id: string) => assignmentsApi.remove(id), onSuccess: invalidate });
}

/* ---------------------------------------------------------- institutions */

export function useInstitutions(query: InstitutionListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.institutions(query),
    queryFn: () => institutionsApi.list(query),
    staleTime: 5 * 60_000,
  });
}

/* ----------------------------------------------------------- investments */

export function useInvestments(query: InvestmentListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.investments(query),
    queryFn: () => investmentsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useCreateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InvestmentCreateInput) => investmentsApi.create(input),
    onSuccess: () => {
      for (const key of [["investments"], ["dashboard"], ["clients"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InvestmentUpdateInput }) =>
      investmentsApi.update(id, input),
    onSuccess: () => {
      for (const key of [["investments"], ["dashboard"], ["clients"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/* ---------------------------------------------------------- transactions */

export function useTransactions(query: TransactionListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.transactions(query),
    queryFn: () => transactionsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransactionCreateInput) => transactionsApi.create(input),
    onSuccess: () => {
      for (const key of [["transactions"], ["investments"], ["dashboard"], ["clients"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransactionUpdateInput }) =>
      transactionsApi.update(id, input),
    onSuccess: () => {
      for (const key of [["transactions"], ["investments"], ["dashboard"], ["clients"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/* ------------------------------------------------------------- documents */

export function useDocuments(query: DocumentListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.documents(query),
    queryFn: () => documentsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentUploadInput) => documentsApi.upload(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useArchiveDocument() {
  const invalidate = useInvalidateOnSuccess([["documents"], ["dashboard"]]);
  return useMutation({ mutationFn: (id: string) => documentsApi.archive(id), onSuccess: invalidate });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateOnSuccess([["documents"], ["dashboard"]]);
  return useMutation({ mutationFn: (id: string) => documentsApi.remove(id), onSuccess: invalidate });
}

/* ---------------------------------------------------------------- prices */

export function usePrices() {
  return useQuery({ queryKey: queryKeys.prices, queryFn: () => pricesApi.list(), staleTime: 60_000 });
}

export function usePriceHistory(commodity: Commodity, enabled = true) {
  return useQuery({
    queryKey: queryKeys.priceHistory(commodity),
    queryFn: () => pricesApi.history(commodity),
    enabled,
    staleTime: 60_000,
  });
}

export function useRefreshPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pricesApi.refresh(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prices"] }),
  });
}

export function useOverridePrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commodity, input }: { commodity: Commodity; input: PriceOverrideInput }) =>
      pricesApi.override(commodity, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prices"] }),
  });
}

export function useClearPriceOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commodity: Commodity) => pricesApi.clearOverride(commodity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prices"] }),
  });
}

/* ------------------------------------------------------------------ news */

export function useNews(limit = 6) {
  return useQuery({
    queryKey: queryKeys.news(limit),
    queryFn: () => newsApi.list(limit),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/* --------------------------------------------------------- notifications */

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: queryKeys.notifications({ unreadOnly }),
    queryFn: () => notificationsApi.list({ unreadOnly, pageSize: 20 }),
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateOnSuccess([["notifications"], ["me"]]);
  return useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), onSuccess: invalidate });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateOnSuccess([["notifications"], ["me"]]);
  return useMutation({ mutationFn: () => notificationsApi.readAll(), onSuccess: invalidate });
}

/* ----------------------------------------------------------------- audit */

export function useAuditLogs(query: AuditListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.audit(query),
    queryFn: () => auditApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/* -------------------------------------------------------------- settings */

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => settingsApi.all() });
}

export function useEffectivePermissions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.effectivePermissions,
    queryFn: () => settingsApi.effective(),
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

/* --------------------------------------------------------------- profile */

export function useProfile() {
  return useQuery({ queryKey: ["profile"], queryFn: () => authApi.profile() });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdateInput) => authApi.updateProfile(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(input),
  });
}

export function useSecurityQuestion(enabled = true) {
  return useQuery({
    queryKey: ["auth", "security-question"],
    queryFn: () => authApi.securityQuestion(),
    enabled,
  });
}

export function useUpdateSecurityQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { securityQuestion: string; securityAnswer: string; currentPassword: string }) =>
      authApi.updateSecurityQuestion(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "security-question"] });
    },
  });
}

export type { DocumentCategory, ProfileUpdateInput };
