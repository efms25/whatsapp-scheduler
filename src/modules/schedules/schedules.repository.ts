import { randomUUID } from 'node:crypto'

import type { DB } from '../../db/index.js'
import { type Message, type MessageRow, mapMessage } from '../messages/messages.types.js'
import {
  type Schedule,
  type ScheduleInput,
  type ScheduleRow,
  mapSchedule,
} from './schedules.types.js'

interface JoinedRow extends ScheduleRow {
  message_title: string
  m_id: string
  m_title: string
  m_content: string | null
  m_message_type: MessageRow['message_type']
  m_media_path: string | null
  m_media_mime_type: string | null
  m_media_original_name: string | null
  m_group_id: string
  m_is_active: number
  m_created_at: string
  m_updated_at: string
}

export interface ScheduleWithMessage {
  schedule: Schedule
  message: Message
}

export function createSchedulesRepository(db: DB) {
  const selectById = db.prepare('SELECT * FROM schedules WHERE id = ?')
  const selectAll = db.prepare(`
    SELECT s.*, m.title AS message_title
    FROM schedules s
    JOIN messages m ON m.id = s.message_id
    ORDER BY s.is_active DESC, s.execution_time ASC, s.created_at DESC
  `)
  const insert = db.prepare(`
    INSERT INTO schedules (
      id, message_id, group_id, days_of_week, execution_time, start_date,
      end_date, timezone, is_active, created_at, updated_at
    ) VALUES (
      @id, @message_id, @group_id, @days_of_week, @execution_time, @start_date,
      @end_date, @timezone, @is_active, @created_at, @updated_at
    )
  `)
  const update = db.prepare(`
    UPDATE schedules SET
      message_id = @message_id,
      group_id = @group_id,
      days_of_week = @days_of_week,
      execution_time = @execution_time,
      start_date = @start_date,
      end_date = @end_date,
      timezone = @timezone,
      is_active = @is_active,
      updated_at = @updated_at
    WHERE id = @id
  `)
  const remove = db.prepare('DELETE FROM schedules WHERE id = ?')
  const toggle = db.prepare('UPDATE schedules SET is_active = ?, updated_at = ? WHERE id = ?')
  const countActive = db.prepare('SELECT COUNT(*) AS total FROM schedules WHERE is_active = 1')
  const countAll = db.prepare('SELECT COUNT(*) AS total FROM schedules')
  const countActiveForMessage = db.prepare(
    'SELECT COUNT(*) AS total FROM schedules WHERE message_id = ? AND is_active = 1',
  )

  const selectActiveWithMessage = db.prepare(`
    SELECT
      s.*,
      m.id AS m_id,
      m.title AS m_title,
      m.content AS m_content,
      m.message_type AS m_message_type,
      m.media_path AS m_media_path,
      m.media_mime_type AS m_media_mime_type,
      m.media_original_name AS m_media_original_name,
      m.group_id AS m_group_id,
      m.is_active AS m_is_active,
      m.created_at AS m_created_at,
      m.updated_at AS m_updated_at
    FROM schedules s
    JOIN messages m ON m.id = s.message_id
    WHERE s.is_active = 1 AND m.is_active = 1
    ORDER BY s.execution_time ASC
  `)

  function toParams(schedule: Schedule): Record<string, string | number | null> {
    return {
      id: schedule.id,
      message_id: schedule.message_id,
      group_id: schedule.group_id,
      days_of_week: JSON.stringify(schedule.days_of_week),
      execution_time: schedule.execution_time,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      timezone: schedule.timezone,
      is_active: schedule.is_active ? 1 : 0,
      created_at: schedule.created_at,
      updated_at: schedule.updated_at,
    }
  }

  return {
    list(): Array<Schedule & { message_title: string }> {
      const rows = selectAll.all() as Array<ScheduleRow & { message_title: string }>
      return rows.map((row) => ({ ...mapSchedule(row), message_title: row.message_title }))
    },

    findById(id: string): Schedule | null {
      const row = selectById.get(id) as ScheduleRow | undefined
      return row ? mapSchedule(row) : null
    },

    create(input: ScheduleInput): Schedule {
      const now = new Date().toISOString()
      const schedule: Schedule = {
        id: randomUUID(),
        ...input,
        created_at: now,
        updated_at: now,
      }

      insert.run(toParams(schedule))

      return schedule
    },

    update(id: string, input: ScheduleInput): Schedule | null {
      const current = selectById.get(id) as ScheduleRow | undefined
      if (!current) return null

      const schedule: Schedule = {
        id,
        ...input,
        created_at: current.created_at,
        updated_at: new Date().toISOString(),
      }

      update.run(toParams(schedule))

      return schedule
    },

    remove(id: string): boolean {
      return remove.run(id).changes === 1
    },

    toggle(id: string, isActive: boolean): boolean {
      return toggle.run(isActive ? 1 : 0, new Date().toISOString(), id).changes === 1
    },

    countActive(): number {
      return (countActive.get() as { total: number }).total
    },

    count(): number {
      return (countAll.get() as { total: number }).total
    },

    countActiveForMessage(messageId: string): number {
      return (countActiveForMessage.get(messageId) as { total: number }).total
    },

    listActiveWithMessage(): ScheduleWithMessage[] {
      const rows = selectActiveWithMessage.all() as JoinedRow[]

      return rows.map((row) => ({
        schedule: mapSchedule(row),
        message: mapMessage({
          id: row.m_id,
          title: row.m_title,
          content: row.m_content,
          message_type: row.m_message_type,
          media_path: row.m_media_path,
          media_mime_type: row.m_media_mime_type,
          media_original_name: row.m_media_original_name,
          group_id: row.m_group_id,
          is_active: row.m_is_active,
          created_at: row.m_created_at,
          updated_at: row.m_updated_at,
        }),
      }))
    },
  }
}

export type SchedulesRepository = ReturnType<typeof createSchedulesRepository>
