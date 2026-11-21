import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { MutableClock } from '../../src/lib/clock.js'
import { FakeProvider } from './fake-provider.js'

export const TEST_USER = 'admin'
export const TEST_PASSWORD = 'test-secret-pass'

export const authHeaders = {
  authorization: `Basic ${Buffer.from(`${TEST_USER}:${TEST_PASSWORD}`).toString('base64')}`,
}

export async function createTestApp(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'wa-scheduler-test-'))

  const env = loadEnv({
    NODE_ENV: 'test',
    BASIC_AUTH_USER: TEST_USER,
    BASIC_AUTH_PASS: TEST_PASSWORD,
    DATABASE_PATH: join(directory, 'db', 'database.sqlite'),
    MEDIA_PATH: join(directory, 'media'),
    AUTH_PATH: join(directory, 'auth'),
    LOG_LEVEL: 'silent',
    WHATSAPP_LOG_LEVEL: 'silent',
    ...overrides,
  })

  const provider = new FakeProvider()
  const clock = new MutableClock('2026-11-23T10:00:00.000Z')

  const { app, ctx } = await createApp(env, { provider, clock })
  await app.ready()

  async function close(): Promise<void> {
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }

  return { app, ctx, provider, clock, env, directory, close }
}

export async function createTextMessage(
  ctx: Awaited<ReturnType<typeof createTestApp>>['ctx'],
  overrides: Partial<{
    title: string
    content: string
    group_id: string
    is_active: boolean
  }> = {},
) {
  return ctx.services.messages.create(
    {
      title: overrides.title ?? 'Mensagem de teste',
      content: overrides.content ?? 'Olá grupo!',
      message_type: 'TEXT',
      group_id: overrides.group_id ?? '120363000000000001@g.us',
      is_active: overrides.is_active ?? true,
    },
    undefined,
  )
}
