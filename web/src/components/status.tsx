import type { ReactNode } from 'react'

import type { ConnectionState, ExecutionStatus } from '../lib/api'
import { Badge, Spinner } from './ui'

const connectionMap: Record<
  ConnectionState,
  { label: string; tone: 'emerald' | 'amber' | 'rose' | 'slate' | 'sky' }
> = {
  idle: { label: 'Inativo', tone: 'slate' },
  connecting: { label: 'Conectando', tone: 'amber' },
  qr: { label: 'Aguardando QR', tone: 'sky' },
  connected: { label: 'Conectado', tone: 'emerald' },
  logged_out: { label: 'Sessão encerrada', tone: 'rose' },
  error: { label: 'Erro', tone: 'rose' },
}

export function ConnectionBadge({ state }: { state: ConnectionState }): ReactNode {
  const item = connectionMap[state]

  return (
    <Badge tone={item.tone}>
      {state === 'connecting' ? <Spinner className="h-3 w-3" /> : null}
      {item.label}
    </Badge>
  )
}

const executionMap: Record<
  ExecutionStatus,
  { label: string; tone: 'emerald' | 'amber' | 'rose' | 'slate' | 'sky' }
> = {
  PENDING: { label: 'Pendente', tone: 'amber' },
  PROCESSING: { label: 'Enviando', tone: 'sky' },
  SENT: { label: 'Enviado', tone: 'emerald' },
  FAILED: { label: 'Falhou', tone: 'rose' },
}

export function ExecutionBadge({ status }: { status: ExecutionStatus }): ReactNode {
  const item = executionMap[status]

  return <Badge tone={item.tone}>{item.label}</Badge>
}
