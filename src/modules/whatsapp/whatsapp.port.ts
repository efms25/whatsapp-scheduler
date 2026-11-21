import type { Message } from '../messages/messages.types.js'

export type WhatsAppConnectionState =
  'idle' | 'connecting' | 'qr' | 'connected' | 'logged_out' | 'error'

export interface WhatsAppStatus {
  state: WhatsAppConnectionState
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

export type WhatsAppProviderErrorKind =
  'not_connected' | 'ambiguous' | 'invalid_target' | 'provider'

export class WhatsAppProviderError extends Error {
  readonly kind: WhatsAppProviderErrorKind

  constructor(kind: WhatsAppProviderErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'WhatsAppProviderError'
    this.kind = kind
  }
}

export interface WhatsAppSendInput {
  group_id: string
  message: Message
  media: { absolute_path: string; mime_type: string; filename: string } | null
}

export interface WhatsAppSendResult {
  message_id: string
}

export interface DeliveryUpdate {
  message_id: string
  status: 'DELIVERED' | 'READ'
}

export interface WhatsAppProvider {
  getStatus(): WhatsAppStatus
  getQr(): string | null
  connect(): Promise<void>
  reconnect(): Promise<void>
  stop(): Promise<void>
  listGroups(options?: { refresh?: boolean }): Promise<WhatsAppGroup[]>
  send(input: WhatsAppSendInput): Promise<WhatsAppSendResult>
  onStateChange(listener: (status: WhatsAppStatus) => void): () => void
  onDelivery(listener: (update: DeliveryUpdate) => void): () => void
}
