import type { Env } from './config/env.js'
import { migrate } from './db/migrate.js'
import { openDatabase, type DB } from './db/index.js'
import { systemClock, type Clock } from './lib/clock.js'
import type { LoggerLike } from './lib/logger.js'
import { createMediaStore } from './lib/media-store.js'
import { createDashboardService } from './modules/dashboard/dashboard.service.js'
import { createExecutionsRepository } from './modules/executions/executions.repository.js'
import { createExecutionsService } from './modules/executions/executions.service.js'
import { createMessagesRepository } from './modules/messages/messages.repository.js'
import { createMessagesService } from './modules/messages/messages.service.js'
import { createSchedulesRepository } from './modules/schedules/schedules.repository.js'
import { createSchedulesService } from './modules/schedules/schedules.service.js'
import { createSettingsRepository } from './modules/settings/settings.repository.js'
import { createSystemService } from './modules/system/system.service.js'
import { createBaileysProvider } from './modules/whatsapp/baileys/baileys.provider.js'
import { createGroupsRepository } from './modules/whatsapp/groups.repository.js'
import { createWhatsAppService } from './modules/whatsapp/whatsapp.service.js'
import type { WhatsAppProvider } from './modules/whatsapp/whatsapp.port.js'
import { createDeliveryService } from './scheduler/delivery.js'
import { createScheduler } from './scheduler/scheduler.js'

export interface AppContext {
  env: Env
  db: DB
  clock: Clock
  provider: WhatsAppProvider
  repos: {
    messages: ReturnType<typeof createMessagesRepository>
    schedules: ReturnType<typeof createSchedulesRepository>
    executions: ReturnType<typeof createExecutionsRepository>
    groups: ReturnType<typeof createGroupsRepository>
    settings: ReturnType<typeof createSettingsRepository>
  }
  services: {
    messages: ReturnType<typeof createMessagesService>
    schedules: ReturnType<typeof createSchedulesService>
    executions: ReturnType<typeof createExecutionsService>
    whatsapp: ReturnType<typeof createWhatsAppService>
    dashboard: ReturnType<typeof createDashboardService>
    system: ReturnType<typeof createSystemService>
  }
  scheduler: ReturnType<typeof createScheduler>
  start(): Promise<void>
  close(): Promise<void>
}

export interface CreateContextOptions {
  logger: LoggerLike
  provider?: WhatsAppProvider
  clock?: Clock
}

export async function createContext(env: Env, options: CreateContextOptions): Promise<AppContext> {
  const logger = options.logger
  const clock = options.clock ?? systemClock
  const db = openDatabase(env.DATABASE_PATH)

  migrate(db)

  const repos = {
    messages: createMessagesRepository(db),
    schedules: createSchedulesRepository(db),
    executions: createExecutionsRepository(db),
    groups: createGroupsRepository(db),
    settings: createSettingsRepository(db),
  }

  const mediaStore = createMediaStore(env.MEDIA_PATH, env.MAX_UPLOAD_MB * 1024 * 1024)

  const provider =
    options.provider ??
    createBaileysProvider({
      authPath: env.AUTH_PATH,
      logger,
      logLevel: env.WHATSAPP_LOG_LEVEL,
    })

  const recovered = repos.executions.recoverStaleProcessing(clock.now().toISOString())
  if (recovered > 0) {
    logger.warn(
      { executions: recovered },
      'marked interrupted executions as failed (delivery outcome unknown)',
    )
  }

  const delivery = createDeliveryService({
    executions: repos.executions,
    messages: repos.messages,
    schedules: repos.schedules,
    mediaStore,
    provider,
    clock,
    logger,
    maxAttempts: env.SCHEDULER_MAX_ATTEMPTS,
  })

  const scheduler = createScheduler({
    db,
    executions: repos.executions,
    schedules: repos.schedules,
    settings: repos.settings,
    delivery,
    clock,
    logger,
    config: {
      tickSeconds: env.SCHEDULER_TICK_SECONDS,
      catchupMinutes: env.SCHEDULER_CATCHUP_MINUTES,
      maxDuePerTick: 25,
    },
  })

  const whatsapp = createWhatsAppService({
    provider,
    groups: repos.groups,
    logger,
  })

  const messages = createMessagesService({
    messages: repos.messages,
    executions: repos.executions,
    schedules: repos.schedules,
    mediaStore,
    delivery,
    clock,
  })

  const schedules = createSchedulesService({
    schedules: repos.schedules,
    messages: repos.messages,
    clock,
    defaultTimezone: env.TIMEZONE,
  })

  const executions = createExecutionsService(repos.executions)

  const dashboard = createDashboardService({
    messages: repos.messages,
    schedules: repos.schedules,
    executions: repos.executions,
    provider,
    clock,
    timezone: env.TIMEZONE,
  })

  const system = createSystemService({
    db,
    env,
    getWhatsAppStatus: () => provider.getStatus(),
  })

  const unsubscribeState = provider.onStateChange((status) => {
    if (status.state === 'connected') {
      void whatsapp.syncGroups().catch((error: unknown) => {
        logger.warn({ err: error }, 'failed to sync WhatsApp groups after connect')
      })
    }
  })

  const unsubscribeDelivery = provider.onDelivery((update) => {
    repos.executions.updateDeliveryByWhatsAppId(
      update.message_id,
      update.status,
      clock.now().toISOString(),
    )
  })

  let started: Promise<void> | null = null
  let closed = false

  async function start(): Promise<void> {
    if (started) return started

    started = (async () => {
      // O loop começa imediatamente; se o WhatsApp ainda não estiver conectado,
      // as execuções ficam PENDING e seguem a política de retry.
      scheduler.start()

      try {
        await whatsapp.connect()
      } catch (error) {
        logger.error({ err: error }, 'failed to start WhatsApp connection')
      }
    })()

    return started
  }

  async function close(): Promise<void> {
    if (closed) return
    closed = true

    await scheduler.stop()
    unsubscribeState()
    unsubscribeDelivery()
    await provider.stop()
    db.close()
  }

  return {
    env,
    db,
    clock,
    provider,
    repos,
    services: {
      messages,
      schedules,
      executions,
      whatsapp,
      dashboard,
      system,
    },
    scheduler,
    start,
    close,
  }
}
