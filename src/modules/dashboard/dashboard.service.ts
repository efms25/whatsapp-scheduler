import type { Clock } from '../../lib/clock.js'
import type { ExecutionsRepository } from '../executions/executions.repository.js'
import type { Execution } from '../executions/executions.types.js'
import type { MessagesRepository } from '../messages/messages.repository.js'
import type { SchedulesRepository } from '../schedules/schedules.repository.js'
import type { WhatsAppProvider, WhatsAppStatus } from '../whatsapp/whatsapp.port.js'
import { nextOccurrence } from '../../scheduler/occurrences.js'

export interface UpcomingExecution {
  schedule_id: string
  message_id: string
  message_title: string
  group_id: string
  days_of_week: number[]
  execution_time: string
  timezone: string
  next_run_at: string
}

export interface DashboardData {
  whatsapp: WhatsAppStatus
  timezone: string
  counts: {
    messages: number
    active_messages: number
    schedules: number
    active_schedules: number
    pending_executions: number
  }
  next_executions: UpcomingExecution[]
  recent_executions: Execution[]
}

export interface DashboardServiceDeps {
  messages: MessagesRepository
  schedules: SchedulesRepository
  executions: ExecutionsRepository
  provider: WhatsAppProvider
  clock: Clock
  timezone: string
}

export function createDashboardService(deps: DashboardServiceDeps) {
  return {
    get(): DashboardData {
      const now = deps.clock.now()
      const activeMessageIds = new Set(
        deps.messages
          .list()
          .filter((message) => message.is_active)
          .map((message) => message.id),
      )

      const nextExecutions = deps.schedules
        .list()
        .filter((schedule) => schedule.is_active && activeMessageIds.has(schedule.message_id))
        .map((schedule) => {
          const next = nextOccurrence(schedule, now)

          if (!next) return null

          const upcoming: UpcomingExecution = {
            schedule_id: schedule.id,
            message_id: schedule.message_id,
            message_title: schedule.message_title,
            group_id: schedule.group_id,
            days_of_week: schedule.days_of_week,
            execution_time: schedule.execution_time,
            timezone: schedule.timezone,
            next_run_at: next.toISOString(),
          }

          return upcoming
        })
        .filter((item): item is UpcomingExecution => item !== null)
        .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at))
        .slice(0, 5)

      return {
        whatsapp: deps.provider.getStatus(),
        timezone: deps.timezone,
        counts: {
          messages: deps.messages.count(),
          active_messages: deps.messages.countActive(),
          schedules: deps.schedules.count(),
          active_schedules: deps.schedules.countActive(),
          pending_executions: deps.executions.countPending(),
        },
        next_executions: nextExecutions,
        recent_executions: deps.executions.recent(10),
      }
    },
  }
}

export type DashboardService = ReturnType<typeof createDashboardService>
