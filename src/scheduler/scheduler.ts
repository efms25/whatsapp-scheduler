import type { LoggerLike } from '../lib/logger.js'

import type { DB } from '../db/index.js'
import type { Clock } from '../lib/clock.js'
import type { ExecutionsRepository } from '../modules/executions/executions.repository.js'
import type { NewPendingExecution } from '../modules/executions/executions.types.js'
import type { SchedulesRepository } from '../modules/schedules/schedules.repository.js'
import type { SettingsRepository } from '../modules/settings/settings.repository.js'
import type { DeliveryService } from './delivery.js'
import { computeSlots } from './occurrences.js'

const LAST_SCAN_KEY = 'scheduler.last_scan_at'

export interface SchedulerConfig {
  tickSeconds: number
  catchupMinutes: number
  maxDuePerTick: number
}

export interface SchedulerDeps {
  db: DB
  executions: ExecutionsRepository
  schedules: SchedulesRepository
  settings: SettingsRepository
  delivery: DeliveryService
  clock: Clock
  logger: LoggerLike
  config: SchedulerConfig
}

export interface TickResult {
  slots_created: number
  delivered: number
}

export interface Scheduler {
  start(): void
  stop(): Promise<void>
  tick(): Promise<TickResult>
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const logger = deps.logger.child({ module: 'scheduler' })

  let timer: ReturnType<typeof setInterval> | null = null
  let running = false
  let currentTick: Promise<TickResult> | null = null

  async function tick(): Promise<TickResult> {
    if (running) return { slots_created: 0, delivered: 0 }
    running = true

    try {
      const now = deps.clock.now()
      const nowIso = now.toISOString()
      const lastScanIso = deps.settings.get(LAST_SCAN_KEY)
      let slotsCreated = 0

      if (!lastScanIso) {
        // Primeira execução: não envia ocorrências anteriores à instalação.
        deps.settings.set(LAST_SCAN_KEY, nowIso)
      } else {
        const lastScanMs = new Date(lastScanIso).getTime()
        const floorMs = now.getTime() - deps.config.catchupMinutes * 60_000
        const fromMs = Math.max(Number.isNaN(lastScanMs) ? now.getTime() : lastScanMs, floorMs)

        if (fromMs < now.getTime()) {
          const from = new Date(fromMs)
          const pendingSlots: NewPendingExecution[] = []

          for (const { schedule, message } of deps.schedules.listActiveWithMessage()) {
            for (const slot of computeSlots(schedule, from, now)) {
              pendingSlots.push({
                dedupe_key: `scheduled:${schedule.id}:${slot.toISOString()}`,
                message_id: message.id,
                message_title: message.title,
                schedule_id: schedule.id,
                group_id: schedule.group_id,
                scheduled_for: slot.toISOString(),
                execution_type: 'SCHEDULED',
              })
            }
          }

          const apply = deps.db.transaction(() => {
            for (const slot of pendingSlots) {
              if (deps.executions.createPending(slot)) {
                slotsCreated += 1
              }
            }
            deps.settings.set(LAST_SCAN_KEY, nowIso)
          })

          apply()
        } else if (now.getTime() > new Date(lastScanIso).getTime()) {
          // Janela só para frente (catch-up = 0): avança o marcador sem gerar slots.
          deps.settings.set(LAST_SCAN_KEY, nowIso)
        }
      }

      let delivered = 0

      for (let index = 0; index < deps.config.maxDuePerTick; index += 1) {
        const due = deps.executions.findNextDue(deps.clock.now().toISOString())
        if (!due) break

        await deps.delivery.deliver(due.id, 'scheduled')
        delivered += 1
      }

      if (slotsCreated > 0 || delivered > 0) {
        logger.info({ slots_created: slotsCreated, delivered }, 'scheduler tick completed')
      }

      return { slots_created: slotsCreated, delivered }
    } finally {
      running = false
    }
  }

  function start(): void {
    if (timer) return

    const run = (): void => {
      currentTick = tick().catch((error: unknown) => {
        logger.error({ err: error }, 'scheduler tick failed')
        return { slots_created: 0, delivered: 0 }
      })
      void currentTick.finally(() => {
        currentTick = null
      })
    }

    run()
    timer = setInterval(run, deps.config.tickSeconds * 1000)
    timer.unref?.()
  }

  async function stop(): Promise<void> {
    if (timer) {
      clearInterval(timer)
      timer = null
    }

    if (currentTick) {
      await currentTick.catch(() => undefined)
    }
  }

  return { start, stop, tick }
}
