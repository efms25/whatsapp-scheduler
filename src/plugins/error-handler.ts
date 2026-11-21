import type { FastifyError, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import { HttpError } from '../errors/http-error.js'
import { WhatsAppProviderError } from '../modules/whatsapp/whatsapp.port.js'

interface ErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

const FILE_LIMIT_CODES = new Set(['FST_REQ_FILE_TOO_LARGE', 'FST_FILES_LIMIT'])
const BODY_LIMIT_CODES = new Set(['FST_ERR_CTP_BODY_TOO_LARGE'])

export const errorHandlerPlugin: FastifyPluginAsync = fp(async (app) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      request.log.warn(
        { err: error, code: error.code, statusCode: error.statusCode },
        'handled application error',
      )

      const body: ErrorBody = {
        error: { code: error.code, message: error.message },
      }

      if (error.details !== undefined) body.error.details = error.details

      return reply.status(error.statusCode).send(body)
    }

    if (error instanceof WhatsAppProviderError) {
      const mapping = {
        not_connected: {
          statusCode: 503,
          code: 'WHATSAPP_DISCONNECTED',
          message: 'WhatsApp is not connected',
        },
        invalid_target: {
          statusCode: 400,
          code: 'INVALID_TARGET',
          message: error.message,
        },
        ambiguous: {
          statusCode: 502,
          code: 'DELIVERY_UNCERTAIN',
          message: error.message,
        },
        provider: {
          statusCode: 502,
          code: 'WHATSAPP_ERROR',
          message: error.message,
        },
      } as const

      const mapped = mapping[error.kind]

      request.log.warn({ err: error, kind: error.kind }, 'WhatsApp provider error')

      return reply.status(mapped.statusCode).send({
        error: { code: mapped.code, message: mapped.message },
      })
    }

    const code = (error as FastifyError & { code?: string }).code

    if (code && FILE_LIMIT_CODES.has(code)) {
      return reply.status(413).send({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Uploaded file is too large' },
      })
    }

    if (code && BODY_LIMIT_CODES.has(code)) {
      return reply.status(413).send({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
      })
    }

    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      return reply.status(400).send({
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Expected a multipart/form-data request',
        },
      })
    }

    if (error.validation) {
      request.log.info({ err: error }, 'request validation failed')

      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation,
        },
      })
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500

    if (statusCode === 401) {
      request.log.info({ err: error }, 'authentication failed')

      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      })
    }

    if (statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' },
      })
    }

    if (statusCode === 415) {
      return reply.status(415).send({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' },
      })
    }

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'unexpected error')

      return reply.status(500).send({
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
      })
    }

    request.log.warn({ err: error }, 'request error')

    return reply.status(statusCode).send({
      error: {
        code: code ?? 'REQUEST_ERROR',
        message: error.message,
      },
    })
  })
})
