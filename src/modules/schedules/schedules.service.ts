import { DateTime, IANAZone } from 'luxon'

import { ConflictError, NotFoundError, ValidationError } from '../../errors/http-error.js'
import type { Clock } from '../../lib/clock.js'
import { isGroupId } from '../../lib/whatsapp-id.js'
import { nextOccurrence } from '../../scheduler/occurrences.js'
import type { MessagesRepository } from '../messages/messages.repository.js'
import type { SchedulesRepository } from './schedules.repository.js'
import type { Schedule, ScheduleInput } from './schedules.types.js'

export interface SchedulePayload {
  message_id: string
  group_id: string
  days_of_week: number[]
  execution_time: string
  start_date?: string | null
  end_date?: string | null
  timezone?: string
  is_active?: boolean
}

export interface SchedulesServiceDeps {
  schedules: SchedulesRepository
  messages: MessagesRepository
  clock: Clock
  defaultTimezone: string
}

export type ScheduleView = Schedule & { message_title: string; next_run_at: string | null }

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function createSchedulesService(deps: SchedulesServiceDeps) {
  function view(schedule: Schedule, messageTitle: string): ScheduleView {
    const next = nextOccurrence(schedule, deps.clock.now())

    return {
      ...schedule,
      message_title: messageTitle,
      next_run_at: next ? next.toISOString() : null,
    }
  }

  function get(id: string): Schedule {
    const schedule = deps.schedules.findById(id)

    if (!schedule) {
      throw new NotFoundError(`Schedule ${id} not found`)
    }

    return schedule
  }

  function getView(id: string): ScheduleView {
    const schedule = get(id)
    const message = deps.messages.findById(schedule.message_id)

    if (!message) {
      throw new NotFoundError(`Message ${schedule.message_id} not found`)
    }

    return view(schedule, message.title)
  }

  function validate(input: ScheduleInput): void {
    const message = deps.messages.findById(input.message_id)

    if (!message) {
      throw new ValidationError(`message_id "${input.message_id}" does not exist`)
    }

    if (!isGroupId(input.group_id)) {
      throw new ValidationError('group_id must be a valid WhatsApp group id (e.g. 123456-789@g.us)')
    }

    const days = [...new Set(input.days_of_week)]

    if (days.length === 0) {
      throw new ValidationError('days_of_week must contain at least one day')
    }

    if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new ValidationError('days_of_week must use ISO weekdays (1=Monday ... 7=Sunday)')
    }

    if (!TIME_PATTERN.test(input.execution_time)) {
      throw new ValidationError('execution_time must be in HH:mm format')
    }

    if (
      !IANAZone.isValidZone(input.timezone) ||
      !DateTime.local().setZone(input.timezone).isValid
    ) {
      throw new ValidationError(`Invalid timezone "${input.timezone}"`)
    }

    for (const [field, value] of [
      ['start_date', input.start_date],
      ['end_date', input.end_date],
    ] as const) {
      if (value !== null && !DATE_PATTERN.test(value)) {
        throw new ValidationError(`${field} must be in YYYY-MM-DD format`)
      }

      if (value !== null) {
        const parsed = DateTime.fromISO(value, { zone: input.timezone })

        if (!parsed.isValid) {
          throw new ValidationError(`${field} is not a valid date`)
        }
      }
    }

    if (input.start_date && input.end_date && input.start_date > input.end_date) {
      throw new ValidationError('start_date must be before or equal to end_date')
    }
  }

  return {
    list(): ScheduleView[] {
      return deps.schedules.list().map((schedule) => view(schedule, schedule.message_title))
    },

    get: getView,

    create(payload: SchedulePayload): ScheduleView {
      const input: ScheduleInput = {
        message_id: payload.message_id,
        group_id: payload.group_id,
        days_of_week: [...new Set(payload.days_of_week)].sort((a, b) => a - b),
        execution_time: payload.execution_time,
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        timezone: payload.timezone ?? deps.defaultTimezone,
        is_active: payload.is_active ?? true,
      }

      validate(input)

      const created = deps.schedules.create(input)
      const message = deps.messages.findById(created.message_id)

      return view(created, message?.title ?? '')
    },

    update(id: string, payload: Partial<SchedulePayload>): ScheduleView {
      const current = get(id)

      const input: ScheduleInput = {
        message_id: payload.message_id ?? current.message_id,
        group_id: payload.group_id ?? current.group_id,
        days_of_week: payload.days_of_week
          ? [...new Set(payload.days_of_week)].sort((a, b) => a - b)
          : current.days_of_week,
        execution_time: payload.execution_time ?? current.execution_time,
        start_date: payload.start_date !== undefined ? payload.start_date : current.start_date,
        end_date: payload.end_date !== undefined ? payload.end_date : current.end_date,
        timezone: payload.timezone ?? current.timezone,
        is_active: payload.is_active ?? current.is_active,
      }

      validate(input)

      const updated = deps.schedules.update(id, input)

      if (!updated) {
        throw new NotFoundError(`Schedule ${id} not found`)
      }

      const message = deps.messages.findById(updated.message_id)

      return view(updated, message?.title ?? '')
    },

    toggle(id: string, isActive?: boolean): ScheduleView {
      const current = get(id)
      const nextValue = isActive ?? !current.is_active

      if (!deps.schedules.toggle(id, nextValue)) {
        throw new ConflictError(`Could not update schedule ${id}`)
      }

      return getView(id)
    },

    remove(id: string): void {
      get(id)

      if (!deps.schedules.remove(id)) {
        throw new NotFoundError(`Schedule ${id} not found`)
      }
    },
  }
}

export type SchedulesService = ReturnType<typeof createSchedulesService>
