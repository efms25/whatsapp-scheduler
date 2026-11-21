import 'dotenv/config'
import { IANAZone } from 'luxon'
import { z } from 'zod'

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  PUBLIC_URL: z.string().url().optional(),

  LOG_LEVEL: z.enum(logLevels).default('info'),
  WHATSAPP_LOG_LEVEL: z.enum(logLevels).default('warn'),

  TIMEZONE: z
    .string()
    .min(1)
    .default('America/Bahia')
    .refine((value) => IANAZone.isValidZone(value), 'must be a valid IANA timezone'),

  BASIC_AUTH_USER: z.string().min(1, 'is required'),
  BASIC_AUTH_PASS: z
    .string()
    .min(8, 'must have at least 8 characters')
    .refine(
      (value) => value !== 'troque-esta-senha',
      'must not be the example value; choose a strong password',
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(100_000).default(300),

  DATABASE_PATH: z.string().min(1).default('./storage/db/database.sqlite'),
  MEDIA_PATH: z.string().min(1).default('./storage/media'),
  AUTH_PATH: z.string().min(1).default('./storage/auth'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(100).default(16),

  SCHEDULER_TICK_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
  SCHEDULER_CATCHUP_MINUTES: z.coerce.number().int().min(0).max(10_080).default(60),
  SCHEDULER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),

  WEB_DIST_PATH: z.string().min(1).default('./web/dist'),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')

    throw new Error(
      `Invalid environment variables:\n${details}\n\nCheck your .env file (see .env.example).`,
    )
  }

  return parsed.data
}
