export interface Schedule {
  id: string
  message_id: string
  group_id: string
  days_of_week: number[]
  execution_time: string
  start_date: string | null
  end_date: string | null
  timezone: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ScheduleInput {
  message_id: string
  group_id: string
  days_of_week: number[]
  execution_time: string
  start_date: string | null
  end_date: string | null
  timezone: string
  is_active: boolean
}

export interface ScheduleRow {
  id: string
  message_id: string
  group_id: string
  days_of_week: string
  execution_time: string
  start_date: string | null
  end_date: string | null
  timezone: string
  is_active: number
  created_at: string
  updated_at: string
}

export function mapSchedule(row: ScheduleRow): Schedule {
  let days: number[] = []
  try {
    const parsed: unknown = JSON.parse(row.days_of_week)
    if (Array.isArray(parsed)) {
      days = parsed.filter((day): day is number => typeof day === 'number')
    }
  } catch {
    days = []
  }

  return {
    id: row.id,
    message_id: row.message_id,
    group_id: row.group_id,
    days_of_week: days,
    execution_time: row.execution_time,
    start_date: row.start_date,
    end_date: row.end_date,
    timezone: row.timezone,
    is_active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
