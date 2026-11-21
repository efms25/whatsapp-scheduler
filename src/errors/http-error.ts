/** Erros de domínio/aplicação que devem virar respostas HTTP previsíveis. */
export class HttpError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = options?.code ?? httpCodeToCode(statusCode)
    this.details = options?.details
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, message, { code: 'BAD_REQUEST', details })
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(400, message, { code: 'VALIDATION_ERROR', details })
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(401, message, { code: 'UNAUTHORIZED', details })
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, message, { code: 'FORBIDDEN', details })
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, message, { code: 'NOT_FOUND', details })
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, message, { code: 'CONFLICT', details })
  }
}

export class PayloadTooLargeError extends HttpError {
  constructor(message = 'Payload too large', details?: unknown) {
    super(413, message, { code: 'PAYLOAD_TOO_LARGE', details })
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message = 'Service unavailable', details?: unknown) {
    super(503, message, { code: 'SERVICE_UNAVAILABLE', details })
  }
}

function httpCodeToCode(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 422:
      return 'UNPROCESSABLE_ENTITY'
    case 429:
      return 'TOO_MANY_REQUESTS'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 503:
      return 'SERVICE_UNAVAILABLE'
    default:
      return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'
  }
}
