export type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO'
export type ExecutionStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED'
export type ExecutionType = 'SCHEDULED' | 'MANUAL'
export type DeliveryStatus = 'UNKNOWN' | 'DELIVERED' | 'READ'
export type ConnectionState = 'idle' | 'connecting' | 'qr' | 'connected' | 'logged_out' | 'error'

export interface Message {
  id: string
  title: string
  content: string | null
  message_type: MessageType
  media_path: string | null
  media_mime_type: string | null
  media_original_name: string | null
  group_id: string
  is_active: boolean
  created_at: string
  updated_at: string
}

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
  message_title: string
  next_run_at: string | null
}

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

export interface WhatsAppStatus {
  state: ConnectionState
  phone_number: string | null
  connected_at: string | null
  last_error: string | null
  updated_at: string
}

export interface WhatsAppGroup {
  id: string
  subject: string
  participants_count: number
}

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

export interface SystemInfo {
  version: string
  node: string
  timezone: string
  uptime_seconds: number
  database: 'ok' | 'error'
  whatsapp: ConnectionState
  web_built: boolean
  timestamp: string
}

export interface ListResponse<T> {
  data: T[]
  total: number
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)

  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`/api${path}`, { ...init, headers })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let data: unknown = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const error = (
      data as { error?: { code?: string; message?: string; details?: unknown } } | null
    )?.error

    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    )
  }

  return data as T
}

export const mediaUrl = (message: Message): string | null => {
  if (!message.media_path) return null

  return `/api/messages/${message.id}/media?v=${encodeURIComponent(message.updated_at)}`
}

export const api = {
  dashboard: () => request<DashboardData>('/dashboard'),
  systemInfo: () => request<SystemInfo>('/system/info'),

  messages: {
    list: () => request<ListResponse<Message>>('/messages'),
    get: (id: string) => request<Message>(`/messages/${id}`),
    create: (form: FormData) => request<Message>('/messages', { method: 'POST', body: form }),
    update: (id: string, form: FormData) =>
      request<Message>(`/messages/${id}`, { method: 'PUT', body: form }),
    remove: (id: string, force = false) =>
      request<void>(`/messages/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
    send: (id: string, groupId?: string) =>
      request<Execution>(`/messages/${id}/send`, {
        method: 'POST',
        body: JSON.stringify(groupId ? { group_id: groupId } : {}),
      }),
  },

  schedules: {
    list: (messageId?: string) =>
      request<ListResponse<Schedule>>(
        `/schedules${messageId ? `?message_id=${encodeURIComponent(messageId)}` : ''}`,
      ),
    create: (payload: SchedulePayload) =>
      request<Schedule>('/schedules', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<SchedulePayload>) =>
      request<Schedule>(`/schedules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    toggle: (id: string, isActive?: boolean) =>
      request<Schedule>(`/schedules/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify(isActive === undefined ? {} : { is_active: isActive }),
      }),
    remove: (id: string) => request<void>(`/schedules/${id}`, { method: 'DELETE' }),
  },

  executions: {
    list: (limit = 50) => request<ListResponse<Execution>>(`/executions?limit=${limit}`),
  },

  whatsapp: {
    status: () => request<WhatsAppStatus>('/whatsapp/status'),
    qr: () => request<{ state: ConnectionState; qr: string | null }>('/whatsapp/qr'),
    groups: (refresh = false) =>
      request<ListResponse<WhatsAppGroup>>(`/whatsapp/groups${refresh ? '?refresh=true' : ''}`),
    refreshGroups: () =>
      request<ListResponse<WhatsAppGroup>>('/whatsapp/groups/refresh', {
        method: 'POST',
      }),
    reconnect: () => request<WhatsAppStatus>('/whatsapp/reconnect', { method: 'POST' }),
  },
}

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
