import type {
  AdminAssignment,
  AuditLog,
  Document,
  Institution,
  Investment,
  Notification,
  PriceOverride,
  PublishedPrice,
  Transaction,
  User,
} from '@prisma/client';
import { dec, moneyNumber, rateNumber } from '../services/finance';
import type { InvestmentProjection } from '../services/finance';

type UserRef = Pick<User, 'id' | 'firstName' | 'lastName'>;
type UserRefWithEmail = UserRef & Partial<Pick<User, 'email'>>;
type UserRefWithStatus = UserRef & Partial<Pick<User, 'email' | 'status'>>;

export function dateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    phone: user.phone,
    address: user.address,
    dateOfBirth: dateOnly(user.dateOfBirth),
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    securityQuestion: user.securityQuestion,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function serializeClientListItem(
  user: User & {
    assignmentsAsClient?: Array<{ admin: UserRefWithEmail; assignedAt: Date; status: string }>;
    investmentsAsClient?: Array<Pick<Investment, 'principalAmount'>>;
    _count?: { investmentsAsClient: number };
    lastActivityAt?: Date | null;
  },
) {
  const activeAssignment = user.assignmentsAsClient?.find((assignment) => assignment.status === 'ACTIVE');
  const invested = (user.investmentsAsClient ?? []).reduce(
    (sum, investment) => sum.plus(dec(investment.principalAmount)),
    dec(0),
  );
  return {
    ...serializeUser(user),
    assignedAdmin: activeAssignment
      ? {
          id: activeAssignment.admin.id,
          fullName: `${activeAssignment.admin.firstName} ${activeAssignment.admin.lastName}`.trim(),
          email: activeAssignment.admin.email,
          assignedAt: activeAssignment.assignedAt,
        }
      : null,
    investmentCount: user._count?.investmentsAsClient ?? user.investmentsAsClient?.length ?? 0,
    totalInvestedPrincipal: moneyNumber(invested),
    lastActivityAt: user.lastActivityAt ?? null,
  };
}

export function serializeInstitution(institution: Institution) {
  return {
    id: institution.id,
    name: institution.name,
    description: institution.description,
    status: institution.status,
    createdAt: institution.createdAt,
    updatedAt: institution.updatedAt,
  };
}

export function serializeInvestment(
  investment: Investment & { institution?: Institution | null; client?: UserRefWithEmail | null },
  projection?: InvestmentProjection,
) {
  return {
    id: investment.id,
    clientId: investment.clientId,
    client: investment.client
      ? {
          id: investment.client.id,
          fullName: `${investment.client.firstName} ${investment.client.lastName}`.trim(),
          email: investment.client.email,
        }
      : undefined,
    institution: investment.institution
      ? { id: investment.institution.id, name: investment.institution.name }
      : undefined,
    institutionId: investment.institutionId,
    name: investment.name,
    principalAmount: moneyNumber(investment.principalAmount),
    currentPrincipal: projection?.currentPrincipal ?? moneyNumber(investment.principalAmount),
    currency: investment.currency,
    annualInterestRate: rateNumber(investment.annualInterestRate),
    compoundingFrequency: investment.compoundingFrequency,
    interestCalculationMethod:
      investment.compoundingFrequency === 'SIMPLE' ? 'SIMPLE_INTEREST' : 'COMPOUND_INTEREST',
    startDate: dateOnly(investment.startDate),
    maturityDate: dateOnly(investment.maturityDate),
    termYears: projection?.termYears ?? null,
    projectedReturn: projection?.projectedReturn ?? null,
    projectedMaturityBalance: projection?.projectedMaturityBalance ?? null,
    status: investment.status,
    notes: investment.notes,
    calculationMethodology: projection?.methodology ?? null,
    lastUpdatedAt: investment.updatedAt,
    createdAt: investment.createdAt,
    updatedAt: investment.updatedAt,
  };
}

export function serializeTransaction(
  transaction: Transaction & { investment?: Pick<Investment, 'id' | 'name'> | null; client?: UserRefWithEmail | null },
) {
  return {
    id: transaction.id,
    clientId: transaction.clientId,
    client: transaction.client
      ? {
          id: transaction.client.id,
          fullName: `${transaction.client.firstName} ${transaction.client.lastName}`.trim(),
        }
      : undefined,
    investmentId: transaction.investmentId,
    investment: transaction.investment
      ? { id: transaction.investment.id, name: transaction.investment.name }
      : null,
    type: transaction.type,
    amount: moneyNumber(transaction.amount),
    currency: transaction.currency,
    description: transaction.description,
    status: transaction.status,
    affectsPrincipal: transaction.affectsPrincipal,
    transactionDate: transaction.transactionDate,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

export function serializeDocument(
  document: Document & { client?: UserRef | null; uploadedBy?: UserRef | null },
) {
  return {
    id: document.id,
    clientId: document.clientId,
    client: document.client
      ? {
          id: document.client.id,
          fullName: `${document.client.firstName} ${document.client.lastName}`.trim(),
        }
      : undefined,
    investmentId: document.investmentId,
    title: document.title,
    category: document.category,
    description: document.description,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    fileExtension: document.originalFilename.includes('.')
      ? document.originalFilename.slice(document.originalFilename.lastIndexOf('.') + 1).toLowerCase()
      : null,
    status: document.status,
    uploadedBy: document.uploadedBy
      ? {
          id: document.uploadedBy.id,
          fullName: `${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`.trim(),
        }
      : null,
    uploadedAt: document.createdAt,
    archivedAt: document.archivedAt,
    updatedAt: document.updatedAt,
  };
}

export function serializeAssignment(
  assignment: AdminAssignment & {
    client?: UserRefWithStatus | null;
    admin?: UserRefWithStatus | null;
    assignedBy?: UserRef | null;
  },
) {
  return {
    id: assignment.id,
    clientId: assignment.clientId,
    client: assignment.client
      ? {
          id: assignment.client.id,
          fullName: `${assignment.client.firstName} ${assignment.client.lastName}`.trim(),
          email: assignment.client.email,
          status: assignment.client.status,
        }
      : undefined,
    adminId: assignment.adminId,
    admin: assignment.admin
      ? {
          id: assignment.admin.id,
          fullName: `${assignment.admin.firstName} ${assignment.admin.lastName}`.trim(),
          email: assignment.admin.email,
          status: assignment.admin.status,
        }
      : undefined,
    assignedBy: assignment.assignedBy
      ? {
          id: assignment.assignedBy.id,
          fullName: `${assignment.assignedBy.firstName} ${assignment.assignedBy.lastName}`.trim(),
        }
      : null,
    assignedAt: assignment.assignedAt,
    endedAt: assignment.endedAt,
    status: assignment.status,
    notes: assignment.notes,
  };
}

export function serializePrice(price: PublishedPrice, status: string, source: string) {
  return {
    id: price.id,
    commodity: price.commodity,
    price: price.price ? moneyNumber(price.price) : null,
    currency: price.currency,
    unit: price.unit,
    provider: price.provider,
    providerPrice: price.providerPrice ? moneyNumber(price.providerPrice) : null,
    providerFetchedAt: price.providerFetchedAt,
    manualOverridePrice: price.manualOverridePrice ? moneyNumber(price.manualOverridePrice) : null,
    overrideReason: price.overrideReason,
    overrideStartsAt: price.overrideStartsAt,
    overrideEndsAt: price.overrideEndsAt,
    lastPublishedAt: price.lastPublishedAt,
    status,
    source,
    updatedAt: price.updatedAt,
  };
}

export function serializePriceOverride(override: PriceOverride & { createdBy?: UserRef | null }) {
  return {
    id: override.id,
    commodity: override.commodity,
    previousPrice: override.previousPrice ? moneyNumber(override.previousPrice) : null,
    newPrice: moneyNumber(override.newPrice),
    currency: override.currency,
    unit: override.unit,
    reason: override.reason,
    startsAt: override.startsAt,
    endsAt: override.endsAt,
    clearedAt: override.clearedAt,
    createdBy: override.createdBy
      ? {
          id: override.createdBy.id,
          fullName: `${override.createdBy.firstName} ${override.createdBy.lastName}`.trim(),
        }
      : null,
    createdAt: override.createdAt,
  };
}

export function serializeAudit(log: AuditLog & { actor?: UserRefWithEmail | null }) {
  return {
    id: log.id.toString(),
    timestamp: log.createdAt,
    actor: log.actor
      ? {
          id: log.actor.id,
          fullName: `${log.actor.firstName} ${log.actor.lastName}`.trim(),
          email: log.actor.email,
        }
      : null,
    actorId: log.actorId,
    actorRole: log.actorRole,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    clientId: log.clientId,
    summary: log.summary,
    beforeData: log.beforeData,
    afterData: log.afterData,
    outcome: log.outcome,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}

export function serializeNotification(notification: Notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    readAt: notification.readAt,
    isRead: Boolean(notification.readAt),
    createdAt: notification.createdAt,
  };
}

export function serializeAdminListItem(
  admin: User & { _count?: { assignmentsAsAdmin: number } },
) {
  return {
    ...serializeUser(admin),
    assignedClientCount: admin._count?.assignmentsAsAdmin ?? 0,
  };
}
