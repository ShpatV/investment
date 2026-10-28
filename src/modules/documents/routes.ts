import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { MultipartFields, MultipartValue } from '@fastify/multipart';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseQuery, parseWith } from '../../lib/http';
import { pageSchema, uuidSchema } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { assertCanManageClient, documentWhereFor } from '../../lib/scope';
import { recordAudit } from '../../lib/audit';
import { serializeDocument } from '../../lib/serializers';
import {
  CLIENT_ALLOWED_CATEGORIES,
  assertAllowedFile,
  deleteStoredFile,
  normalizeOriginalFilename,
  readFileBuffer,
  safeDownloadName,
  saveFile,
} from '../../lib/storage';
import { createSignedDocumentUrl, verifyDocumentSignature } from '../../lib/signed-url';
import { notify } from '../../services/notifications';

const categorySchema = z.enum([
  'IDENTIFICATION',
  'INVESTMENT_AGREEMENT',
  'STATEMENT',
  'TAX_DOCUMENT',
  'OTHER',
]);

function getField(fields: MultipartFields, name: string): string | undefined {
  const field = fields[name];
  const single = Array.isArray(field) ? field[0] : field;
  if (!single || single.type !== 'field') return undefined;
  const value = (single as MultipartValue).value;
  return typeof value === 'string' ? value : undefined;
}

function streamHeaders(filename: string, mimeType: string, size: number) {
  return {
    'Content-Type': mimeType,
    'Content-Length': size,
    'Content-Disposition': `attachment; filename="${safeDownloadName(filename)}"`,
    'Cache-Control': 'private, no-store',
  };
}

async function sendDocument(
  reply: FastifyReply,
  document: { storageKey: string; originalFilename: string; mimeType: string; fileSize: number },
) {
  const buffer = await readFileBuffer(document.storageKey);
  return reply
    .headers(streamHeaders(document.originalFilename, document.mimeType, buffer.byteLength))
    .send(buffer);
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/documents',
    { preHandler: [authenticate], schema: { tags: ['Documents'], summary: 'List documents' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(
        z.object({
          ...pageSchema,
          clientId: uuidSchema.optional(),
          investmentId: uuidSchema.optional(),
          category: categorySchema.optional(),
          status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
          search: z.string().trim().max(200).optional(),
        }),
        request.query,
      );

      const extra = {
        ...(query.clientId && auth.role !== 'USER' ? { clientId: query.clientId } : {}),
        ...(query.investmentId ? { investmentId: query.investmentId } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { originalFilename: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const where = documentWhereFor(auth, extra);
      const [total, documents] = await Promise.all([
        prisma.document.count({ where }),
        prisma.document.findMany({
          where,
          include: {
            uploadedBy: true,
            client: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
          ...paginationArgs(query),
        }),
      ]);

      return reply.send(paginated(documents.map(serializeDocument), total, query));
    },
  );

  app.post(
    '/documents',
    {
      preHandler: [authenticate],
      schema: { tags: ['Documents'], summary: 'Upload a document (multipart/form-data)' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const file = await request.file();
      if (!file) throw AppError.validation('A file is required');

      const title = getField(file.fields, 'title')?.trim();
      const categoryRaw = getField(file.fields, 'category');
      const description = getField(file.fields, 'description')?.trim();
      const clientIdField = getField(file.fields, 'clientId');
      const investmentIdField = getField(file.fields, 'investmentId');

      if (!title || title.length > 200) throw AppError.validation('Document title is required (max 200 characters)');
      const category = categorySchema.safeParse(categoryRaw);
      if (!category.success) throw AppError.validation('A valid document category is required');

      let clientId: string;
      if (auth.role === 'USER') {
        clientId = auth.id;
        if (clientIdField && clientIdField !== auth.id) throw AppError.forbidden();
        if (!CLIENT_ALLOWED_CATEGORIES.includes(category.data as (typeof CLIENT_ALLOWED_CATEGORIES)[number])) {
          throw AppError.forbidden('Clients may not upload documents in this category');
        }
      } else {
        if (!clientIdField) throw AppError.validation('clientId is required');
        clientId = clientIdField;
        await assertCanManageClient(auth, clientId);
      }

      if (investmentIdField) {
        const investment = await prisma.investment.findUnique({
          where: { id: investmentIdField },
          select: { id: true, clientId: true },
        });
        if (!investment || investment.clientId !== clientId) {
          throw AppError.validation('Investment does not belong to the selected client');
        }
      }

      const buffer = await file.toBuffer();
      assertAllowedFile(file.mimetype, buffer.byteLength);
      const stored = await saveFile(buffer, file.mimetype);

      try {
        const document = await prisma.$transaction(async (tx) => {
          const created = await tx.document.create({
            data: {
              clientId,
              investmentId: investmentIdField ?? null,
              title,
              category: category.data,
              description: description || null,
              storageKey: stored.storageKey,
              originalFilename: normalizeOriginalFilename(file.filename),
              mimeType: file.mimetype,
              fileSize: stored.fileSize,
              checksum: stored.checksum,
              uploadedById: auth.id,
              status: 'ACTIVE',
            },
            include: {
              uploadedBy: true,
              client: { select: { id: true, firstName: true, lastName: true } },
            },
          });
          await recordAudit(
            {
              actorId: auth.id,
              actorRole: auth.role,
              action: 'DOCUMENT_UPLOADED',
              entityType: 'DOCUMENT',
              entityId: created.id,
              clientId,
              summary: `Document ${created.title} uploaded`,
              after: {
                id: created.id,
                title: created.title,
                category: created.category,
                originalFilename: created.originalFilename,
                mimeType: created.mimeType,
                fileSize: created.fileSize,
              },
              ipAddress: request.ip,
            },
            tx,
          );
          await notify(
            {
              userId: clientId,
              type: 'DOCUMENT',
              title: 'New document available',
              body: `${created.title} was uploaded to your document center.`,
              link: '/documents',
            },
            tx,
          );
          return created;
        });
        return reply.status(201).send({ data: serializeDocument(document) });
      } catch (error) {
        await deleteStoredFile(stored.storageKey);
        throw error;
      }
    },
  );

  app.get(
    '/documents/:id',
    { preHandler: [authenticate], schema: { tags: ['Documents'], summary: 'Get document metadata' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const document = await prisma.document.findFirst({
        where: documentWhereFor(auth, { id }),
        include: {
          uploadedBy: true,
          client: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      if (!document) throw AppError.notFound('Document not found');
      return reply.send({ data: serializeDocument(document) });
    },
  );

  app.get(
    '/documents/:id/download',
    { preHandler: [authenticate], schema: { tags: ['Documents'], summary: 'Download an authorized document' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const document = await prisma.document.findFirst({ where: documentWhereFor(auth, { id }) });
      if (!document) throw AppError.notFound('Document not found');
      return sendDocument(reply, document);
    },
  );

  app.post(
    '/documents/:id/signed-url',
    {
      preHandler: [authenticate],
      schema: { tags: ['Documents'], summary: 'Create a short-lived download URL' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const document = await prisma.document.findFirst({
        where: documentWhereFor(auth, { id }),
        select: { id: true },
      });
      if (!document) throw AppError.notFound('Document not found');
      return reply.send({ data: createSignedDocumentUrl(document.id) });
    },
  );

  // Signed URLs are intentionally unauthenticated; possession of a valid,
  // short-lived HMAC signature grants temporary access to that single file.
  app.get(
    '/documents/download/:id',
    { schema: { tags: ['Documents'], summary: 'Download via signed URL' } },
    async (request, reply) => {
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const query = parseQuery(
        z.object({
          expires: z.coerce.number().int().positive(),
          signature: z.string().min(10).max(200),
        }),
        request.query,
      );
      if (!verifyDocumentSignature(id, query.expires, query.signature)) {
        throw new AppError(403, 'INVALID_SIGNATURE', 'This download link is invalid or has expired');
      }
      const document = await prisma.document.findFirst({ where: { id } });
      if (!document) throw AppError.notFound('Document not found');
      return sendDocument(reply, document);
    },
  );

  app.post(
    '/documents/:id/archive',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Documents'], summary: 'Archive a document' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      await archiveDocument(request, id, auth);
      return reply.status(204).send();
    },
  );

  app.delete(
    '/documents/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Documents'], summary: 'Archive a document (soft delete)' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      await archiveDocument(request, id, auth);
      return reply.status(204).send();
    },
  );
}

async function archiveDocument(
  request: FastifyRequest,
  id: string,
  auth: ReturnType<typeof currentUser>,
): Promise<void> {
  const document = await prisma.document.findFirst({ where: documentWhereFor(auth, { id }) });
  if (!document) throw AppError.notFound('Document not found');
  if (document.status === 'ARCHIVED') return;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.document.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await recordAudit(
      {
        actorId: auth.id,
        actorRole: auth.role,
        action: 'DOCUMENT_ARCHIVED',
        entityType: 'DOCUMENT',
        entityId: id,
        clientId: document.clientId,
        summary: `Document ${document.title} archived`,
        before: { status: document.status },
        after: { status: updated.status },
        ipAddress: request.ip,
      },
      tx,
    );
  });
}
