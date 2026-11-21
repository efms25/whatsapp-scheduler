import { createHash, timingSafeEqual } from 'node:crypto'

import type { Env } from '../config/env.js'

export const AUTH_REALM = 'WhatsApp Scheduler'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b))
}

export function createBasicAuthValidate(
  env: Env,
): (username: string, password: string) => Promise<void | Error> {
  return async (username, password) => {
    const validUser = constantTimeEquals(username, env.BASIC_AUTH_USER)
    const validPassword = constantTimeEquals(password, env.BASIC_AUTH_PASS)

    if (validUser && validPassword) return

    const error = new Error('Authentication required') as Error & { statusCode?: number }
    error.statusCode = 401

    return error
  }
}
