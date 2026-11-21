import type { LoggerLike } from '../lib/logger.js'

import type { Clock } from '../lib/clock.js'
import type { MediaStore } from '../lib/media-store.js'
import { NotFoundError } from '../errors/http-error.js'
import type { MessagesRepository } from '../modules/messages/messages.repository.js'
import type { ExecutionsRepository } from '../modules/executions/executions.repository.js'
import type { Execution } from '../modules/executions/executions.types.js'
import type { SchedulesRepository } from '../modules/schedules/schedules.repository.js'
import { type WhatsAppProvider, WhatsAppProviderError } from '../modules/whatsapp/whatsapp.port.js'
import { canRetry, retryDelayMs } from './retry-policy.js'

export type DeliveryMode = 'scheduled' | 'manual'

export interface DeliveryServiceDeps {
  executions: ExecutionsRepository
  messages: MessagesRepository
  schedules: SchedulesRepository
  mediaStore: MediaStore
  provider: WhatsAppProvider
  clock: Clock
  logger: LoggerLike
  maxAttempts: number
}

export interface DeliveryService {
  deliver(executionId: string, mode: DeliveryMode): Promise<Execution>
}

export function createDeliveryService(deps: DeliveryServiceDeps): DeliveryService {
  const logger = deps.logger.child({ module: 'delivery' })

  // Serializa os envios: baixo volume e menos risco de concorrência no socket.
  let sendQueue: Promise<void> = Promise.resolve()

  function enqueueSend<T>(task: () => Promise<T>): Promise<T> {
    const run = sendQueue.then(task)
    sendQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    async deliver(executionId: string, mode: DeliveryMode): Promise<Execution> {
      const existing = deps.executions.findById(executionId)
      if (!existing) throw new NotFoundError(`Execution ${executionId} not found`)
      if (existing.status !== 'PENDING') return existing

      const now = deps.clock.now()
      const nowIso = now.toISOString()

      if (!deps.executions.claim(executionId, nowIso)) {
        return deps.executions.findById(executionId) ?? existing
      }

      const execution = deps.executions.findById(executionId) ?? existing

      const fail = (message: string): Execution => {
        deps.executions.markFailed(executionId, message, deps.clock.now().toISOString())
        logger.warn({ execution_id: executionId, error: message, mode }, 'message delivery failed')
        return deps.executions.findById(executionId) ?? execution
      }

      const retryOrFail = (message: string): Execution => {
        if (mode === 'scheduled' && canRetry(execution.attempt_count, deps.maxAttempts)) {
          const delay = retryDelayMs(execution.attempt_count)
          const nextAttempt = new Date(deps.clock.now().getTime() + delay).toISOString()

          deps.executions.releaseForRetry(
            executionId,
            nextAttempt,
            message,
            deps.clock.now().toISOString(),
          )
          logger.warn(
            { execution_id: executionId, delay_ms: delay, attempt: execution.attempt_count },
            'delivery postponed for retry',
          )

          return deps.executions.findById(executionId) ?? execution
        }

        return fail(message)
      }

      const message = execution.message_id ? deps.messages.findById(execution.message_id) : null

      if (!message) {
        return fail('Message no longer exists')
      }

      if (execution.execution_type === 'SCHEDULED') {
        if (!execution.schedule_id) {
          return fail('Schedule no longer exists')
        }

        const schedule = deps.schedules.findById(execution.schedule_id)

        if (!schedule) {
          return fail('Schedule no longer exists')
        }

        if (!schedule.is_active) {
          return fail('Schedule is disabled')
        }
      }

      if (execution.execution_type === 'SCHEDULED' && !message.is_active) {
        return fail('Message is disabled')
      }

      if (deps.provider.getStatus().state !== 'connected') {
        return retryOrFail('WhatsApp is not connected')
      }

      let media: { absolute_path: string; mime_type: string; filename: string } | null = null

      if (message.message_type !== 'TEXT') {
        const absolutePath = deps.mediaStore.resolve(message.media_path)

        if (!absolutePath || !message.media_mime_type) {
          return fail('Media file is missing')
        }

        media = {
          absolute_path: absolutePath,
          mime_type: message.media_mime_type,
          filename: message.media_original_name ?? 'file',
        }
      }

      try {
        const result = await enqueueSend(() =>
          deps.provider.send({
            group_id: execution.group_id,
            message,
            media,
          }),
        )

        const sentAt = deps.clock.now().toISOString()
        deps.executions.markSent(executionId, result.message_id, sentAt)

        logger.info(
          { execution_id: executionId, whatsapp_message_id: result.message_id, mode },
          'message sent',
        )

        return deps.executions.findById(executionId) ?? execution
      } catch (error) {
        const providerError =
          error instanceof WhatsAppProviderError
            ? error
            : new WhatsAppProviderError(
                'ambiguous',
                error instanceof Error ? error.message : String(error),
                { cause: error },
              )

        if (providerError.kind === 'ambiguous') {
          return fail(`Delivery uncertain: ${providerError.message}`)
        }

        if (providerError.kind === 'not_connected') {
          return retryOrFail(providerError.message)
        }

        return fail(providerError.message)
      }
    },
  }
}
