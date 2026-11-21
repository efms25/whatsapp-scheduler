import type { LoggerLike } from '../../lib/logger.js'

import type { GroupsRepository } from './groups.repository.js'
import type { WhatsAppGroup, WhatsAppProvider, WhatsAppStatus } from './whatsapp.port.js'
import { WhatsAppProviderError } from './whatsapp.port.js'

export interface WhatsAppServiceDeps {
  provider: WhatsAppProvider
  groups: GroupsRepository
  logger: LoggerLike
}

export function createWhatsAppService(deps: WhatsAppServiceDeps) {
  const logger = deps.logger.child({ module: 'whatsapp-service' })
  let syncing: Promise<number> | null = null

  async function syncGroups(): Promise<number> {
    if (syncing) return syncing

    syncing = (async () => {
      const groups = await deps.provider.listGroups({ refresh: true })
      deps.groups.upsertMany(groups)
      logger.info({ groups: groups.length }, 'WhatsApp groups synchronized')

      return groups.length
    })()

    try {
      return await syncing
    } finally {
      syncing = null
    }
  }

  return {
    status(): WhatsAppStatus {
      return deps.provider.getStatus()
    },

    qr(): { state: WhatsAppStatus['state']; qr: string | null } {
      const status = deps.provider.getStatus()

      return {
        state: status.state,
        qr: status.state === 'qr' ? deps.provider.getQr() : null,
      }
    },

    async groupsList(refresh = false): Promise<WhatsAppGroup[]> {
      if (refresh) {
        try {
          await syncGroups()
        } catch (error) {
          if (error instanceof WhatsAppProviderError) throw error
          throw new WhatsAppProviderError(
            'provider',
            error instanceof Error ? error.message : String(error),
            { cause: error },
          )
        }
      }

      const stored = deps.groups.list()

      if (stored.length === 0 && deps.provider.getStatus().state === 'connected') {
        try {
          await syncGroups()
        } catch (error) {
          logger.warn({ err: error }, 'could not populate empty group cache')
        }

        return deps.groups.list()
      }

      return stored
    },

    syncGroups,

    async connect(): Promise<void> {
      await deps.provider.connect()
    },

    async reconnect(): Promise<void> {
      await deps.provider.reconnect()
    },
  }
}

export type WhatsAppService = ReturnType<typeof createWhatsAppService>
