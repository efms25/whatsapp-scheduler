import { mkdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AnyMessageContent,
  type ConnectionState,
  type GroupMetadata,
  type WASocket,
} from '@whiskeysockets/baileys'
import type { Boom } from '@hapi/boom'
import type { LoggerLike } from '../../../lib/logger.js'
import QRCode from 'qrcode'

import { isGroupId } from '../../../lib/whatsapp-id.js'
import {
  type DeliveryUpdate,
  type WhatsAppGroup,
  type WhatsAppProvider,
  WhatsAppProviderError,
  type WhatsAppSendInput,
  type WhatsAppSendResult,
  type WhatsAppStatus,
} from '../whatsapp.port.js'

const RECONNECT_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]
const GROUPS_CACHE_TTL_MS = 60_000
const GROUP_METADATA_TTL_MS = 5 * 60_000

interface CachedGroupMetadata {
  metadata: GroupMetadata
  cachedAt: number
}

export interface BaileysProviderOptions {
  authPath: string
  logger: LoggerLike
  logLevel?: string
}

export function createBaileysProvider(options: BaileysProviderOptions): WhatsAppProvider {
  const logger = options.logger.child(
    { module: 'whatsapp' },
    options.logLevel ? { level: options.logLevel } : undefined,
  )

  let sock: WASocket | null = null
  let connecting: Promise<void> | null = null
  let stopped = false
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let qrDataUrl: string | null = null

  let status: WhatsAppStatus = {
    state: 'idle',
    phone_number: null,
    connected_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }

  let groupsCache: { groups: WhatsAppGroup[]; cachedAt: number } | null = null
  const groupMetadata = new Map<string, CachedGroupMetadata>()

  const stateListeners = new Set<(status: WhatsAppStatus) => void>()
  const deliveryListeners = new Set<(update: DeliveryUpdate) => void>()

  function setStatus(patch: Partial<WhatsAppStatus>): void {
    status = { ...status, ...patch, updated_at: new Date().toISOString() }

    for (const listener of stateListeners) {
      try {
        listener(status)
      } catch (error) {
        logger.warn({ err: error }, 'state listener failed')
      }
    }
  }

  function emitDelivery(update: DeliveryUpdate): void {
    for (const listener of deliveryListeners) {
      try {
        listener(update)
      } catch (error) {
        logger.warn({ err: error }, 'delivery listener failed')
      }
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return

    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]
    reconnectAttempt += 1

    logger.info({ delay_ms: delay, attempt: reconnectAttempt }, 'scheduling WhatsApp reconnect')

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, delay)

    reconnectTimer.unref?.()
  }

  function resetAuthPath(): void {
    rmSync(options.authPath, { recursive: true, force: true })
    mkdirSync(options.authPath, { recursive: true, mode: 0o700 })
  }

  async function connect(): Promise<void> {
    if (stopped) return
    if (sock) return
    if (connecting) return connecting

    connecting = (async () => {
      try {
        mkdirSync(options.authPath, { recursive: true, mode: 0o700 })

        const { state, saveCreds } = await useMultiFileAuthState(options.authPath)
        const versionInfo = await fetchLatestBaileysVersion().catch((error: unknown) => {
          logger.warn({ err: error }, 'failed to fetch latest WhatsApp Web version')
          return null
        })

        if (stopped || sock) return

        const socket = makeWASocket({
          auth: state,
          ...(versionInfo ? { version: versionInfo.version } : {}),
          browser: Browsers.ubuntu('WhatsApp Scheduler'),
          logger,
          markOnlineOnConnect: false,
          syncFullHistory: false,
          generateHighQualityLinkPreview: false,
          cachedGroupMetadata: async (jid) => {
            const cached = groupMetadata.get(jid)
            if (!cached) return undefined
            if (Date.now() - cached.cachedAt > GROUP_METADATA_TTL_MS) {
              groupMetadata.delete(jid)
              return undefined
            }
            return cached.metadata
          },
        })

        sock = socket
        setStatus({ state: 'connecting', last_error: null, phone_number: null })

        socket.ev.on('creds.update', saveCreds)

        socket.ev.on('connection.update', (update) => {
          void handleConnectionUpdate(socket, update)
        })

        socket.ev.on('messages.update', (updates) => {
          for (const { key, update } of updates) {
            if (!key.fromMe || !key.id) continue

            const messageStatus = update.status
            if (messageStatus === 3) {
              emitDelivery({ message_id: key.id, status: 'DELIVERED' })
            } else if (messageStatus === 4 || messageStatus === 5) {
              emitDelivery({ message_id: key.id, status: 'READ' })
            }
          }
        })

        socket.ev.on('groups.update', (updates) => {
          for (const update of updates) {
            if (update.id) groupMetadata.delete(update.id)
          }
          groupsCache = null
        })

        socket.ev.on('group-participants.update', (event) => {
          groupMetadata.delete(event.id)
          groupsCache = null
        })
      } catch (error) {
        logger.error({ err: error }, 'failed to create WhatsApp socket')
        setStatus({
          state: 'error',
          last_error: error instanceof Error ? error.message : String(error),
        })
        scheduleReconnect()
      } finally {
        connecting = null
      }
    })()

    return connecting
  }

  async function handleConnectionUpdate(
    socket: WASocket,
    update: Partial<ConnectionState>,
  ): Promise<void> {
    if (sock !== socket) return

    if (update.qr) {
      try {
        const dataUrl = await QRCode.toDataURL(update.qr, {
          margin: 1,
          width: 320,
          errorCorrectionLevel: 'M',
        })

        // Evita sobrescrever um estado 'connected' caso a geração do QR
        // termine depois do evento de abertura da conexão.
        if (sock !== socket || status.state === 'connected') return

        qrDataUrl = dataUrl
        setStatus({ state: 'qr', last_error: null })
      } catch (error) {
        logger.warn({ err: error }, 'failed to render QR code')
        if (sock === socket && status.state !== 'connected') setStatus({ state: 'qr' })
      }
    }

    if (update.connection === 'open') {
      qrDataUrl = null
      reconnectAttempt = 0
      clearReconnectTimer()

      const contact = socket.user
      const phoneNumber = contact?.phoneNumber ?? contact?.id?.split('@')[0]?.split(':')[0] ?? null

      groupsCache = null
      groupMetadata.clear()

      setStatus({
        state: 'connected',
        phone_number: phoneNumber,
        connected_at: new Date().toISOString(),
        last_error: null,
      })
      return
    }

    if (update.connection === 'close') {
      qrDataUrl = null
      sock = null

      const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      const reason =
        update.lastDisconnect?.error?.message ?? 'WhatsApp connection closed unexpectedly'

      if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
        setStatus({
          state: 'logged_out',
          connected_at: null,
          last_error: 'Session logged out or invalid. Reconnect to scan a new QR code.',
        })
        return
      }

      if (statusCode === DisconnectReason.connectionReplaced) {
        setStatus({
          state: 'error',
          connected_at: null,
          last_error:
            'Connection replaced by another WhatsApp session. Reconnect manually if this was unexpected.',
        })
        return
      }

      if (stopped) {
        setStatus({ state: 'idle', connected_at: null })
        return
      }

      setStatus({ state: 'connecting', connected_at: null, last_error: reason })
      scheduleReconnect()
    }
  }

  async function listGroups(parameters?: { refresh?: boolean }): Promise<WhatsAppGroup[]> {
    if (!sock || status.state !== 'connected') {
      throw new WhatsAppProviderError('not_connected', 'WhatsApp is not connected')
    }

    if (
      !parameters?.refresh &&
      groupsCache &&
      Date.now() - groupsCache.cachedAt < GROUPS_CACHE_TTL_MS
    ) {
      return groupsCache.groups
    }

    try {
      const all = await sock.groupFetchAllParticipating()
      const now = Date.now()
      const groups: WhatsAppGroup[] = Object.values(all).map((group) => {
        groupMetadata.set(group.id, { metadata: group, cachedAt: now })

        return {
          id: group.id,
          subject: group.subject || group.id,
          participants_count: group.participants?.length ?? 0,
        }
      })

      groups.sort((a, b) => a.subject.localeCompare(b.subject))
      groupsCache = { groups, cachedAt: now }

      return groups
    } catch (error) {
      throw new WhatsAppProviderError(
        'provider',
        `Failed to fetch WhatsApp groups: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  async function send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    if (!sock || status.state !== 'connected') {
      throw new WhatsAppProviderError('not_connected', 'WhatsApp is not connected')
    }

    if (!isGroupId(input.group_id)) {
      throw new WhatsAppProviderError(
        'invalid_target',
        `Invalid WhatsApp group id "${input.group_id}"`,
      )
    }

    const { message } = input
    let content: AnyMessageContent

    if (message.message_type === 'TEXT') {
      content = { text: message.content ?? '' }
    } else {
      if (!input.media) {
        throw new WhatsAppProviderError('provider', 'Media file is missing')
      }

      let buffer: Buffer
      try {
        buffer = await readFile(input.media.absolute_path)
      } catch (error) {
        throw new WhatsAppProviderError('provider', 'Media file could not be read', {
          cause: error,
        })
      }

      if (message.message_type === 'IMAGE') {
        content = {
          image: buffer,
          ...(message.content ? { caption: message.content } : {}),
          mimetype: input.media.mime_type,
        }
      } else {
        content = {
          audio: buffer,
          mimetype: mapAudioMimeType(input.media.mime_type),
        }
      }
    }

    try {
      const result = await sock.sendMessage(input.group_id, content)

      if (!result?.key?.id) {
        throw new WhatsAppProviderError(
          'ambiguous',
          'WhatsApp accepted the request but did not return a message id',
        )
      }

      return { message_id: result.key.id }
    } catch (error) {
      if (error instanceof WhatsAppProviderError) throw error
      throw classifySendError(error)
    }
  }

  async function reconnect(): Promise<void> {
    stopped = false
    clearReconnectTimer()
    reconnectAttempt = 0

    if (status.state === 'logged_out') {
      logger.info('resetting WhatsApp auth state after logout')
      resetAuthPath()
    }

    const current = sock
    sock = null

    if (current) {
      await current.end(undefined).catch((error: unknown) => {
        logger.debug({ err: error }, 'error while closing WhatsApp socket')
      })
    }

    setStatus({ state: 'connecting', connected_at: null, last_error: null })

    await connect()
  }

  async function stop(): Promise<void> {
    stopped = true
    clearReconnectTimer()

    const current = sock
    sock = null

    if (current) {
      await current.end(undefined).catch(() => undefined)
    }

    qrDataUrl = null
    setStatus({ state: 'idle', connected_at: null })
  }

  return {
    getStatus: () => status,
    getQr: () => qrDataUrl,
    connect,
    reconnect,
    stop,
    listGroups,
    send,
    onStateChange(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },
    onDelivery(listener) {
      deliveryListeners.add(listener)
      return () => deliveryListeners.delete(listener)
    },
  }
}

function mapAudioMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'audio/mpeg':
    case 'audio/mp3':
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'audio/mp4'
    case 'audio/ogg':
    case 'audio/opus':
      return 'audio/ogg; codecs=opus'
    default:
      return mimeType
  }
}

function classifySendError(error: unknown): WhatsAppProviderError {
  const message = error instanceof Error ? error.message : String(error)
  const statusCode =
    (error as Boom | undefined)?.output?.statusCode ??
    (error as { statusCode?: number } | undefined)?.statusCode

  if (/timed?\s?out|timeout|connection (closed|lost|terminated)|socket/i.test(message)) {
    return new WhatsAppProviderError('ambiguous', message, { cause: error })
  }

  if (statusCode === 408) {
    return new WhatsAppProviderError('ambiguous', message, { cause: error })
  }

  if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
    return new WhatsAppProviderError('invalid_target', message, { cause: error })
  }

  if (statusCode !== undefined && statusCode >= 500) {
    return new WhatsAppProviderError('ambiguous', message, { cause: error })
  }

  // Erros desconhecidos são tratados como ambíguos: pode ter havido entrega,
  // então não fazemos retry automático para não duplicar mensagens.
  return new WhatsAppProviderError('ambiguous', message, { cause: error })
}
