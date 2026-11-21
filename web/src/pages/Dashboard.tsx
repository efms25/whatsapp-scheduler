import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ConnectionBadge, ExecutionBadge } from '../components/status'
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/format'

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: number | string
  hint?: string
}): ReactNode {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export default function Dashboard(): ReactNode {
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
    refetchInterval: 15_000,
  })

  if (dashboard.isLoading) {
    return (
      <div className="flex items-center gap-3 p-10 text-slate-400">
        <Spinner /> Carregando dashboard…
      </div>
    )
  }

  if (dashboard.error || !dashboard.data) {
    return (
      <Alert title="Não foi possível carregar o dashboard">
        {dashboard.error instanceof Error ? dashboard.error.message : 'Erro desconhecido'}
      </Alert>
    )
  }

  const data = dashboard.data
  const status = data.whatsapp

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos agendamentos e da conexão com o WhatsApp."
        action={
          <Link
            to="/schedules"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Novo agendamento
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Mensagens"
          value={data.counts.messages}
          hint={`${data.counts.active_messages} ativa(s)`}
        />
        <Stat
          label="Agendamentos"
          value={data.counts.active_schedules}
          hint={`${data.counts.schedules} cadastrado(s)`}
        />
        <Stat label="Execuções pendentes" value={data.counts.pending_executions} />
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">WhatsApp</p>
          <div className="mt-2">
            <ConnectionBadge state={status.state} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {status.phone_number ?? 'Nenhum número conectado'}
          </p>
          {status.state !== 'connected' ? (
            <Link to="/settings" className="mt-2 inline-block text-xs font-medium text-emerald-300">
              Conectar / ver QR →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Próximas execuções" description={`Timezone: ${data.timezone}`}>
          {data.next_executions.length === 0 ? (
            <EmptyState
              title="Nenhuma execução prevista"
              description="Crie um agendamento ativo para ver as próximas execuções."
            />
          ) : (
            <ul className="divide-y divide-slate-800">
              {data.next_executions.map((item) => (
                <li key={item.schedule_id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{item.message_title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.group_id} · {item.execution_time}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-xs text-slate-400">
                    {formatDateTime(item.next_run_at, item.timezone)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Histórico recente"
          action={
            <Link to="/send" className="text-xs font-medium text-emerald-300">
              Enviar agora →
            </Link>
          }
        >
          {data.recent_executions.length === 0 ? (
            <EmptyState title="Nenhum envio ainda" />
          ) : (
            <ul className="divide-y divide-slate-800">
              {data.recent_executions.map((execution) => (
                <li key={execution.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-slate-200">{execution.message_title}</p>
                    <ExecutionBadge status={execution.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {execution.execution_type === 'MANUAL' ? 'Manual' : 'Agendado'} ·{' '}
                    {formatDateTime(execution.sent_at ?? execution.scheduled_for, data.timezone)}
                    {execution.delivery_status !== 'UNKNOWN'
                      ? ` · ${execution.delivery_status === 'READ' ? 'Lida' : 'Entregue'}`
                      : ''}
                  </p>
                  {execution.error_message ? (
                    <p className="mt-1 line-clamp-2 text-xs text-rose-300">
                      {execution.error_message}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
