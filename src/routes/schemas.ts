import { z } from 'zod'

export const idParamsSchema = z.object({
  id: z.string().uuid(),
})

export const messageTypeSchema = z.enum(['TEXT', 'IMAGE', 'AUDIO'])
export const executionStatusSchema = z.enum(['PENDING', 'PROCESSING', 'SENT', 'FAILED'])
export const executionTypeSchema = z.enum(['SCHEDULED', 'MANUAL'])
export const deliveryStatusSchema = z.enum(['UNKNOWN', 'DELIVERED', 'READ'])

export const messageSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  message_type: messageTypeSchema,
  media_path: z.string().nullable(),
  media_mime_type: z.string().nullable(),
  media_original_name: z.string().nullable(),
  group_id: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const messageListSchema = z.object({
  data: z.array(messageSchema),
  total: z.number(),
})

export const scheduleSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  group_id: z.string(),
  days_of_week: z.array(z.number()),
  execution_time: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  timezone: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  message_title: z.string(),
  next_run_at: z.string().nullable(),
})

export const scheduleListSchema = z.object({
  data: z.array(scheduleSchema),
  total: z.number(),
})

export const executionSchema = z.object({
  id: z.string(),
  dedupe_key: z.string(),
  message_id: z.string().nullable(),
  message_title: z.string(),
  schedule_id: z.string().nullable(),
  group_id: z.string(),
  scheduled_for: z.string().nullable(),
  execution_type: executionTypeSchema,
  status: executionStatusSchema,
  attempt_count: z.number(),
  next_attempt_at: z.string().nullable(),
  whatsapp_message_id: z.string().nullable(),
  delivery_status: deliveryStatusSchema,
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const executionListSchema = z.object({
  data: z.array(executionSchema),
  total: z.number(),
})

export const whatsappStatusSchema = z.object({
  state: z.enum(['idle', 'connecting', 'qr', 'connected', 'logged_out', 'error']),
  phone_number: z.string().nullable(),
  connected_at: z.string().nullable(),
  last_error: z.string().nullable(),
  updated_at: z.string(),
})

export const whatsappQrSchema = z.object({
  state: whatsappStatusSchema.shape.state,
  qr: z.string().nullable(),
})

export const whatsappGroupSchema = z.object({
  id: z.string(),
  subject: z.string(),
  participants_count: z.number(),
})

export const whatsappGroupListSchema = z.object({
  data: z.array(whatsappGroupSchema),
  total: z.number(),
})

export const upcomingExecutionSchema = z.object({
  schedule_id: z.string(),
  message_id: z.string(),
  message_title: z.string(),
  group_id: z.string(),
  days_of_week: z.array(z.number()),
  execution_time: z.string(),
  timezone: z.string(),
  next_run_at: z.string(),
})

export const dashboardSchema = z.object({
  whatsapp: whatsappStatusSchema,
  timezone: z.string(),
  counts: z.object({
    messages: z.number(),
    active_messages: z.number(),
    schedules: z.number(),
    active_schedules: z.number(),
    pending_executions: z.number(),
  }),
  next_executions: z.array(upcomingExecutionSchema),
  recent_executions: z.array(executionSchema),
})

export const systemInfoSchema = z.object({
  version: z.string(),
  node: z.string(),
  timezone: z.string(),
  uptime_seconds: z.number(),
  database: z.enum(['ok', 'error']),
  whatsapp: whatsappStatusSchema.shape.state,
  web_built: z.boolean(),
  timestamp: z.string(),
})

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['ok', 'error']),
  whatsapp: whatsappStatusSchema.shape.state,
  version: z.string(),
  uptime_seconds: z.number(),
  timestamp: z.string(),
})

export const booleanStringSchema = z.enum(['true', 'false', '1', '0']).transform((value) => {
  return value === 'true' || value === '1'
})
