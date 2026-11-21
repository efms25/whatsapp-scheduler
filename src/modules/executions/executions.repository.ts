import { randomUUID } from 'node:crypto'

import type { DB } from '../../db/index.js'
import type {
  DeliveryStatus,
  Execution,
  ExecutionFilters,
  ExecutionRow,
  NewPendingExecution,
} from './executions.types.js'
import { mapExecution } from './executions.types.js'

type Params = Array<string | number>

export function createExecutionsRepository(db: DB) {
  const selectById = db.prepare('SELECT * FROM execution_history WHERE id = ?')

  const selectNextDue = db.prepare(`
    SELECT * FROM execution_history
    WHERE status = 'PENDING'
      AND execution_type = 'SCHEDULED'
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY COALESCE(scheduled_for, created_at) ASC
    LIMIT 1
  `)

  const insertPending = db.prepare(`
    INSERT OR IGNORE INTO execution_history (
      id, dedupe_key, message_id, message_title, schedule_id, group_id, scheduled_for,
      execution_type, status, attempt_count, next_attempt_at, whatsapp_message_id,
      delivery_status, sent_at, delivered_at, error_message, created_at, updated_at
    ) VALUES (
      @id, @dedupe_key, @message_id, @message_title, @schedule_id, @group_id, @scheduled_for,
      @execution_type, 'PENDING', 0, NULL, NULL,
      'UNKNOWN', NULL, NULL, NULL, @now, @now
    )
  `)

  const claim = db.prepare(`
    UPDATE execution_history
    SET status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        updated_at = ?
    WHERE id = ? AND status = 'PENDING'
  `)

  const markSent = db.prepare(`
    UPDATE execution_history
    SET status = 'SENT',
        sent_at = ?,
        whatsapp_message_id = ?,
        error_message = NULL,
        next_attempt_at = NULL,
        updated_at = ?
    WHERE id = ?
  `)

  const markFailed = db.prepare(`
    UPDATE execution_history
    SET status = 'FAILED',
        error_message = ?,
        next_attempt_at = NULL,
        updated_at = ?
    WHERE id = ?
  `)

  const releaseForRetry = db.prepare(`
    UPDATE execution_history
    SET status = 'PENDING',
        next_attempt_at = ?,
        error_message = ?,
        updated_at = ?
    WHERE id = ?
  `)

  const updateDelivery = db.prepare(`
    UPDATE execution_history
    SET delivery_status = CASE
          WHEN ? = 'READ' THEN 'READ'
          WHEN delivery_status = 'UNKNOWN' THEN 'DELIVERED'
          ELSE delivery_status
        END,
        delivered_at = COALESCE(delivered_at, ?),
        updated_at = ?
    WHERE whatsapp_message_id = ?
  `)

  const recoverProcessing = db.prepare(`
    UPDATE execution_history
    SET status = 'FAILED',
        error_message = 'Process interrupted while sending; delivery outcome unknown',
        next_attempt_at = NULL,
        updated_at = ?
    WHERE status = 'PROCESSING'
  `)

  const recoverManualPending = db.prepare(`
    UPDATE execution_history
    SET status = 'FAILED',
        error_message = 'Manual send interrupted before completion',
        next_attempt_at = NULL,
        updated_at = ?
    WHERE status = 'PENDING' AND execution_type = 'MANUAL'
  `)

  const countPending = db.prepare(
    `SELECT COUNT(*) AS total FROM execution_history WHERE status = 'PENDING'`,
  )

  const selectRecent = db.prepare(
    'SELECT * FROM execution_history ORDER BY created_at DESC LIMIT ?',
  )

  function buildWhere(filters: ExecutionFilters): { clause: string; params: Params } {
    const clauses: string[] = []
    const params: Params = []

    if (filters.status) {
      clauses.push('status = ?')
      params.push(filters.status)
    }
    if (filters.execution_type) {
      clauses.push('execution_type = ?')
      params.push(filters.execution_type)
    }
    if (filters.message_id) {
      clauses.push('message_id = ?')
      params.push(filters.message_id)
    }

    return {
      clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    }
  }

  function findById(id: string): Execution | null {
    const row = selectById.get(id) as ExecutionRow | undefined
    return row ? mapExecution(row) : null
  }

  return {
    findById,

    createPending(input: NewPendingExecution): Execution | null {
      const id = randomUUID()
      const now = new Date().toISOString()

      const result = insertPending.run({
        id,
        dedupe_key: input.dedupe_key,
        message_id: input.message_id,
        message_title: input.message_title,
        schedule_id: input.schedule_id,
        group_id: input.group_id,
        scheduled_for: input.scheduled_for,
        execution_type: input.execution_type,
        now,
      })

      if (result.changes !== 1) return null

      return findById(id)
    },

    findNextDue(nowIso: string): Execution | null {
      const row = selectNextDue.get(nowIso) as ExecutionRow | undefined
      return row ? mapExecution(row) : null
    },

    claim(id: string, nowIso: string): boolean {
      return claim.run(nowIso, id).changes === 1
    },

    markSent(id: string, whatsappMessageId: string, sentAtIso: string): void {
      markSent.run(sentAtIso, whatsappMessageId, sentAtIso, id)
    },

    markFailed(id: string, errorMessage: string, updatedAtIso: string): void {
      markFailed.run(errorMessage, updatedAtIso, id)
    },

    releaseForRetry(
      id: string,
      nextAttemptAtIso: string,
      errorMessage: string,
      updatedAtIso: string,
    ): void {
      releaseForRetry.run(nextAttemptAtIso, errorMessage, updatedAtIso, id)
    },

    updateDeliveryByWhatsAppId(
      whatsappMessageId: string,
      deliveryStatus: Exclude<DeliveryStatus, 'UNKNOWN'>,
      atIso: string,
    ): boolean {
      return updateDelivery.run(deliveryStatus, atIso, atIso, whatsappMessageId).changes > 0
    },

    recoverStaleProcessing(nowIso: string): number {
      const interrupted = recoverProcessing.run(nowIso).changes
      const manualInterrupted = recoverManualPending.run(nowIso).changes

      return interrupted + manualInterrupted
    },

    list(filters: ExecutionFilters = {}): Execution[] {
      const { clause, params } = buildWhere(filters)
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
      const offset = Math.max(filters.offset ?? 0, 0)

      const rows = db
        .prepare(
          `SELECT * FROM execution_history ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset) as ExecutionRow[]

      return rows.map(mapExecution)
    },

    count(filters: ExecutionFilters = {}): number {
      const { clause, params } = buildWhere(filters)

      const row = db
        .prepare(`SELECT COUNT(*) AS total FROM execution_history ${clause}`)
        .get(...params) as { total: number }

      return row.total
    },

    countPending(): number {
      return (countPending.get() as { total: number }).total
    },

    recent(limit: number): Execution[] {
      const rows = selectRecent.all(limit) as ExecutionRow[]
      return rows.map(mapExecution)
    },
  }
}

export type ExecutionsRepository = ReturnType<typeof createExecutionsRepository>
