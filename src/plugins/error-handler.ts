import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { config } from '../config';

export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
        requestId: request.id,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          },
        },
        requestId: request.id,
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'field';
        return reply.status(409).send({
          error: { code: 'CONFLICT', message: `A record with this ${target} already exists` },
          requestId: request.id,
        });
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Resource not found' },
          requestId: request.id,
        });
      }
      if (error.code === 'P2003') {
        return reply.status(409).send({
          error: { code: 'CONFLICT', message: 'This record is referenced by other data and cannot be changed' },
          requestId: request.id,
        });
      }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid data supplied to the database' },
        requestId: request.id,
      });
    }

    const errorCode = (error as { code?: string }).code;
    if (errorCode?.startsWith('FST_JWT')) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
        requestId: request.id,
      });
    }

    if (
      errorCode === 'FST_REQ_FILE_TOO_LARGE' ||
      errorCode === 'FST_FILES_LIMIT' ||
      errorCode === 'FST_PARTS_LIMIT'
    ) {
      return reply.status(413).send({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Uploaded file exceeds the allowed size or part limit' },
        requestId: request.id,
      });
    }

    if (errorCode === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Expected multipart/form-data upload' },
        requestId: request.id,
      });
    }

    const fastifyError = error as { statusCode?: number; message?: string };
    if (
      fastifyError.statusCode &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      return reply.status(fastifyError.statusCode).send({
        error: { code: 'BAD_REQUEST', message: fastifyError.message ?? 'Bad request' },
        requestId: request.id,
      });
    }

    request.log.error({ err: error, requestId: request.id }, 'Unhandled request error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: config.isProduction ? 'An unexpected error occurred' : fastifyError.message,
      },
      requestId: request.id,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
      requestId: request.id,
    });
  });
}
