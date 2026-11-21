import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { WhatsAppProviderError } from '../../src/modules/whatsapp/whatsapp.port.js'
import { authHeaders, createTestApp, createTextMessage } from '../helpers/test-app.js'

const GROUP_ID = '120363000000000001@g.us'

async function seedSchedule(
  ctx: Awaited<ReturnType<typeof createTestApp>>['ctx'],
  messageId: string,
): Promise<string> {
  const schedule = ctx.services.schedules.create({
    message_id: messageId,
    group_id: GROUP_ID,
    days_of_week: [1],
    execution_time: '08:00',
    timezone: 'America/Bahia',
  })

  return schedule.id
}

describe('scheduler', () => {
  it('executa um agendamento uma única vez (dedupe)', async () => {
    const { ctx, provider, clock, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)
      await seedSchedule(ctx, message.id)

      await ctx.scheduler.tick()
      clock.set('2026-11-23T11:00:05.000Z')

      await ctx.scheduler.tick()

      const first = ctx.services.executions.list({})
      assert.equal(first.total, 1)
      assert.equal(first.data[0]?.status, 'SENT')
      assert.equal(first.data[0]?.whatsapp_message_id, 'fake-1')
      assert.equal(provider.sent.length, 1)

      provider.emitDelivery({ message_id: 'fake-1', status: 'READ' })

      const withReceipt = ctx.repos.executions.findById(first.data[0]?.id ?? '')
      assert.equal(withReceipt?.delivery_status, 'READ')
      assert.ok(withReceipt?.delivered_at)

      await ctx.scheduler.tick()

      assert.equal(provider.sent.length, 1)
      assert.equal(ctx.services.executions.list({}).total, 1)
    } finally {
      await close()
    }
  })

  it('não duplica slot por causa do unique dedupe_key', async () => {
    const { ctx, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)
      const slot = {
        dedupe_key: `scheduled:test:${new Date().toISOString()}`,
        message_id: message.id,
        message_title: message.title,
        schedule_id: null,
        group_id: GROUP_ID,
        scheduled_for: '2026-11-23T11:00:00.000Z',
        execution_type: 'SCHEDULED' as const,
      }

      assert.ok(ctx.repos.executions.createPending(slot))
      assert.equal(ctx.repos.executions.createPending(slot), null)
    } finally {
      await close()
    }
  })

  it('reagenda quando o WhatsApp está desconectado e envia depois', async () => {
    const { ctx, provider, clock, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)
      await seedSchedule(ctx, message.id)

      await ctx.scheduler.tick()
      clock.set('2026-11-23T11:00:05.000Z')
      provider.state = 'idle'

      await ctx.scheduler.tick()

      const pending = ctx.services.executions.list({})
      assert.equal(pending.total, 1)
      assert.equal(pending.data[0]?.status, 'PENDING')
      assert.equal(pending.data[0]?.attempt_count, 1)
      assert.ok(pending.data[0]?.next_attempt_at)
      assert.equal(provider.sent.length, 0)

      clock.advance(2 * 60_000)
      provider.state = 'connected'

      await ctx.scheduler.tick()

      const sent = ctx.services.executions.list({})
      assert.equal(sent.data[0]?.status, 'SENT')
      assert.equal(provider.sent.length, 1)
    } finally {
      await close()
    }
  })

  it('não faz retry automático de falha ambígua', async () => {
    const { ctx, provider, clock, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)
      await seedSchedule(ctx, message.id)

      await ctx.scheduler.tick()
      clock.set('2026-11-23T11:00:05.000Z')
      provider.failNext = new WhatsAppProviderError('ambiguous', 'Timed Out')

      await ctx.scheduler.tick()

      const failed = ctx.services.executions.list({})
      assert.equal(failed.total, 1)
      assert.equal(failed.data[0]?.status, 'FAILED')
      assert.match(failed.data[0]?.error_message ?? '', /Delivery uncertain/)

      clock.advance(60 * 60_000)
      await ctx.scheduler.tick()

      assert.equal(provider.sent.length, 0)
      assert.equal(ctx.services.executions.list({}).total, 1)
    } finally {
      await close()
    }
  })

  it('envio manual não altera o agendamento', async () => {
    const { app, ctx, provider, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)
      await seedSchedule(ctx, message.id)

      const before = ctx.services.schedules.list()
      assert.equal(before.length, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/${message.id}/send`,
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: '{}',
      })

      assert.equal(response.statusCode, 200)
      assert.equal(response.json().status, 'SENT')
      assert.equal(response.json().execution_type, 'MANUAL')
      assert.equal(provider.sent.length, 1)

      const after = ctx.services.schedules.list()
      assert.equal(after.length, 1)
      assert.equal(after[0]?.id, before[0]?.id)
      assert.equal(after[0]?.is_active, true)

      await ctx.scheduler.tick()
      assert.equal(ctx.services.executions.list({ execution_type: 'SCHEDULED' }).total, 0)
    } finally {
      await close()
    }
  })

  it('recupera execuções PROCESSING como falhas ambíguas no boot', async () => {
    const { ctx, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)
      const execution = ctx.repos.executions.createPending({
        dedupe_key: `scheduled:interrupted:${Date.now()}`,
        message_id: message.id,
        message_title: message.title,
        schedule_id: null,
        group_id: GROUP_ID,
        scheduled_for: '2026-11-23T11:00:00.000Z',
        execution_type: 'SCHEDULED',
      })

      assert.ok(execution)
      assert.equal(ctx.repos.executions.claim(execution.id, new Date().toISOString()), true)

      const manual = ctx.repos.executions.createPending({
        dedupe_key: `manual:interrupted:${Date.now()}`,
        message_id: message.id,
        message_title: message.title,
        schedule_id: null,
        group_id: GROUP_ID,
        scheduled_for: new Date().toISOString(),
        execution_type: 'MANUAL',
      })
      assert.ok(manual)

      const recovered = ctx.repos.executions.recoverStaleProcessing(new Date().toISOString())
      assert.equal(recovered, 2)

      const stored = ctx.repos.executions.findById(execution.id)
      assert.equal(stored?.status, 'FAILED')
      assert.match(stored?.error_message ?? '', /delivery outcome unknown/)

      const storedManual = ctx.repos.executions.findById(manual.id)
      assert.equal(storedManual?.status, 'FAILED')
      assert.match(storedManual?.error_message ?? '', /Manual send interrupted/)
    } finally {
      await close()
    }
  })
})
