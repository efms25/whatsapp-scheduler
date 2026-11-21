export type ExecutionStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED'
export type ExecutionType = 'SCHEDULED' | 'MANUAL'
export type DeliveryStatus = 'UNKNOWN' | 'DELIVERED' | 'READ'

export interface Execution {
  id: string
  dedupe_key: string
  message_id: string | null
  message_title: string
  schedule_id: string | null
  group_id: string
  scheduled_for: string | null
  execution_type: ExecutionType
  status: ExecutionStatus
  attempt_count: number
  next_attempt_at: string | null
  whatsapp_message_id: string | null
  delivery_status: DeliveryStatus
  sent_at: string | null
  delivered_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface ExecutionRow extends Omit<
  Execution,
  'execution_type' | 'status' | 'delivery_status'
> {
  execution_type: ExecutionType
  status: ExecutionStatus
  delivery_status: DeliveryStatus
}

export interface NewPendingExecution {
  dedupe_key: string
  message_id: string
  message_title: string
  schedule_id: string | null
  group_id: string
  scheduled_for: string | null
  execution_type: ExecutionType
}

export interface ExecutionFilters {
  status?: ExecutionStatus
  execution_type?: ExecutionType
  message_id?: string
  limit?: number
  offset?: number
}

export function mapExecution(row: ExecutionRow): Execution {
  return { ...row }
}
