import {
  type DeliveryUpdate,
  type WhatsAppGroup,
  type WhatsAppProvider,
  WhatsAppProviderError,
  type WhatsAppSendInput,
  type WhatsAppSendResult,
  type WhatsAppStatus,
  type WhatsAppConnectionState,
} from '../../src/modules/whatsapp/whatsapp.port.js'

export class FakeProvider implements WhatsAppProvider {
  state: WhatsAppConnectionState = 'connected'
  qr: string | null = 'data:image/png;base64,fake-qr'
  groups: WhatsAppGroup[] = [
    { id: '120363000000000001@g.us', subject: 'Grupo de Teste', participants_count: 3 },
  ]
  sent: WhatsAppSendInput[] = []
  failNext: WhatsAppProviderError | null = null
  connectedAt: string | null = '2026-11-23T09:00:00.000Z'

  private stateListeners = new Set<(status: WhatsAppStatus) => void>()
  private deliveryListeners = new Set<(update: DeliveryUpdate) => void>()

  getStatus(): WhatsAppStatus {
    return {
      state: this.state,
      phone_number: this.state === 'connected' ? '5511999999999' : null,
      connected_at: this.state === 'connected' ? this.connectedAt : null,
      last_error: null,
      updated_at: '2026-11-23T09:00:00.000Z',
    }
  }

  getQr(): string | null {
    return this.state === 'qr' ? this.qr : null
  }

  async connect(): Promise<void> {
    this.setState('connected')
  }

  async reconnect(): Promise<void> {
    this.setState('connected')
  }

  async stop(): Promise<void> {
    this.state = 'idle'
  }

  async listGroups(): Promise<WhatsAppGroup[]> {
    if (this.state !== 'connected') {
      throw new WhatsAppProviderError('not_connected', 'WhatsApp is not connected')
    }

    return this.groups
  }

  async send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    if (this.failNext) {
      const error = this.failNext
      this.failNext = null
      throw error
    }

    if (this.state !== 'connected') {
      throw new WhatsAppProviderError('not_connected', 'WhatsApp is not connected')
    }

    this.sent.push(input)

    return { message_id: `fake-${this.sent.length}` }
  }

  onStateChange(listener: (status: WhatsAppStatus) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onDelivery(listener: (update: DeliveryUpdate) => void): () => void {
    this.deliveryListeners.add(listener)
    return () => this.deliveryListeners.delete(listener)
  }

  setState(state: WhatsAppConnectionState): void {
    this.state = state

    for (const listener of this.stateListeners) {
      listener(this.getStatus())
    }
  }

  emitDelivery(update: DeliveryUpdate): void {
    for (const listener of this.deliveryListeners) {
      listener(update)
    }
  }
}
