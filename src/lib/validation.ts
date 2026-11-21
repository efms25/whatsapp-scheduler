import type { ZodType } from 'zod'

import { ValidationError } from '../errors/http-error.js'

export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)

  if (!result.success) {
    throw new ValidationError('Validation failed', result.error.issues)
  }

  return result.data
}
