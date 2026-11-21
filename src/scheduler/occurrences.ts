import { DateTime } from 'luxon'

import type { Schedule } from '../modules/schedules/schedules.types.js'

export type OccurrenceSchedule = Pick<
  Schedule,
  'days_of_week' | 'execution_time' | 'start_date' | 'end_date' | 'timezone'
>

/**
 * Calcula as ocorrências de um schedule no intervalo (from, to] em UTC.
 *
 * Regras de DST:
 * - horário local inexistente (spring forward) é ignorado;
 * - horário local ambíguo (fall back) gera uma única ocorrência.
 */
export function computeSlots(schedule: OccurrenceSchedule, from: Date, to: Date): Date[] {
  if (to.getTime() <= from.getTime()) return []

  const [hour, minute] = schedule.execution_time.split(':').map(Number)

  if (
    hour === undefined ||
    minute === undefined ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    schedule.days_of_week.length === 0
  ) {
    return []
  }

  const fromLocal = DateTime.fromJSDate(from, { zone: schedule.timezone })
  const toLocal = DateTime.fromJSDate(to, { zone: schedule.timezone })

  if (!fromLocal.isValid || !toLocal.isValid) return []

  const lastDay = toLocal.endOf('day')
  let day = fromLocal.startOf('day')

  const slots: Date[] = []

  while (day <= lastDay) {
    const localDate = day.toFormat('yyyy-MM-dd')

    const withinRange =
      (!schedule.start_date || localDate >= schedule.start_date) &&
      (!schedule.end_date || localDate <= schedule.end_date)

    if (schedule.days_of_week.includes(day.weekday) && withinRange) {
      const slot = day.set({ hour, minute, second: 0, millisecond: 0 })

      // Em DST gap o Luxon desloca o horário; nesse caso a ocorrência não existe.
      if (slot.isValid && slot.hour === hour && slot.minute === minute) {
        const slotDate = slot.toJSDate()
        const timestamp = slotDate.getTime()

        if (timestamp > from.getTime() && timestamp <= to.getTime()) {
          slots.push(slotDate)
        }
      }
    }

    day = day.plus({ days: 1 })
  }

  return slots
}

export function nextOccurrence(
  schedule: OccurrenceSchedule,
  from: Date,
  horizonDays = 30,
): Date | null {
  const to = new Date(from.getTime() + horizonDays * 24 * 60 * 60 * 1000)
  const slots = computeSlots(schedule, from, to)

  return slots[0] ?? null
}
