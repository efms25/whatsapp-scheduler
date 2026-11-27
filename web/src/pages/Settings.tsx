import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { ConnectionBadge } from '../components/status'
import { Icon } from '../components/icons'
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { formatDateTime, formatError, formatUptime } from '../lib/format'

export default function Settings(): ReactNode {
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<{ tone: 'emerald' | 'rose'; text: string } | null>(null)
  const [groupQuery, setGroupQuery] = useState('')

  const status = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: api.whatsapp.status,
    refetchInterval: 3_000,
  })

  const qr = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: api.whatsapp.qr,
    enabled: status.data?.state === 'qr',
    refetchInterval: 3_000,
  })

  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.whatsapp.groups() })
  const system = useQuery({ queryKey: ['system'], queryFn: api.systemInfo })

  const reconnect = useMutation({
    mutationFn: api.whatsapp.reconnect,
    onSuccess: async () => {
      setFeedback({ tone: 'emerald', text: 'Reconexão iniciada. Acompanhe o status abaixo.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] }),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] }),
      ])
    },
    onError: (error) => setFeedback({ tone: 'rose', text: formatError(error) }),
  })

  const refreshGroups = useMutation({
    mutationFn: api.whatsapp.refreshGroups,
    onSuccess: async (data) => {
      setFeedback({ tone: 'emerald', text: `${data.total} grupo(s) sincronizado(s).` })
      await queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (error) => setFeedback({ tone: 'rose', text: formatError(error) }),
  })

  if (status.isLoading) {
    return (
      <div className="flex items-center gap-3 p-10 text-slate-400">
        <Spinner /> Carregando configurações…
      </div>
    )
  }

  const connection = status.data
  const qrData = qr.data?.qr

  const allGroups = groups.data?.data ?? []
  const query = groupQuery.trim().toLowerCase()
  const visibleGroups = query
    ? allGroups.filter(
        (group) =>
          group.subject.toLowerCase().includes(query) || group.id.toLowerCase().includes(query),
      )
    : allGroups

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Conexão do WhatsApp, grupos disponíveis e informações do sistema."
      />

      {feedback ? (
        <div className="mb-4">
          <Alert tone={feedback.tone}>
            <div className="flex items-start justify-between gap-3">
              <span>{feedback.text}</span>
              <button
                type="button"
                className="rounded p-1 opacity-70 hover:opacity-100"
                onClick={() => setFeedback(null)}
                aria-label="Fechar aviso"
              >
                <Icon name="x" />
              </button>
            </div>
          </Alert>
        </div>
      ) : null}

      {status.error ? (
        <Alert title="Erro ao consultar conexão">{formatError(status.error)}</Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Conexão com o WhatsApp">
          {connection ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ConnectionBadge state={connection.state} />
                {connection.phone_number ? (
                  <Badge tone="violet">{connection.phone_number}</Badge>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase text-slate-500">Conectado desde</dt>
                  <dd className="mt-0.5 text-slate-300">
                    {formatDateTime(connection.connected_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Atualizado</dt>
                  <dd className="mt-0.5 text-slate-300">{formatDateTime(connection.updated_at)}</dd>
                </div>
              </dl>

              {connection.last_error ? <Alert tone="amber">{connection.last_error}</Alert> : null}

              <div>
                <Button
                  variant="secondary"
                  onClick={() => reconnect.mutate()}
                  disabled={reconnect.isPending}
                >
                  <Icon name="refresh" />
                  {reconnect.isPending ? 'Reconectando…' : 'Reconectar'}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Autenticação por QR Code">
          {connection?.state === 'qr' ? (
            <div className="flex flex-col items-center gap-3 text-center">
              {qrData ? (
                <img
                  src={qrData}
                  alt="QR Code de autenticação do WhatsApp"
                  className="h-64 w-64 rounded-xl bg-white p-2"
                />
              ) : (
                <Spinner className="h-8 w-8" />
              )}
              <p className="text-sm text-slate-300">
                Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo e
                escaneie o código.
              </p>
            </div>
          ) : connection?.state === 'logged_out' ? (
            <div className="flex flex-col gap-3">
              <Alert tone="rose">
                A sessão foi encerrada pelo WhatsApp. Use “Reconectar” para gerar um novo QR Code.
              </Alert>
              <Button onClick={() => reconnect.mutate()} disabled={reconnect.isPending}>
                <Icon name="qr" /> Gerar novo QR Code
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm text-slate-400">
              <p>
                {connection?.state === 'connected'
                  ? 'Dispositivo autenticado e conectado. A sessão é persistida no volume de autenticação.'
                  : 'O QR Code aparecerá aqui quando a autenticação for necessária.'}
              </p>
              {connection?.state === 'connecting' ? (
                <p className="flex items-center gap-2 text-amber-300">
                  <Spinner className="h-3.5 w-3.5" /> Conectando ao WhatsApp…
                </p>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Grupos disponíveis"
          description="Cache local sincronizado com o WhatsApp."
          action={
            <Button
              variant="secondary"
              onClick={() => refreshGroups.mutate()}
              disabled={refreshGroups.isPending || connection?.state !== 'connected'}
            >
              <Icon name="refresh" />
              Atualizar
            </Button>
          }
        >
          {groups.isLoading ? (
            <Spinner />
          ) : allGroups.length === 0 ? (
            <EmptyState
              title="Nenhum grupo sincronizado"
              description="Conecte o WhatsApp e clique em Atualizar."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                />
                <Input
                  type="search"
                  value={groupQuery}
                  onChange={(event) => setGroupQuery(event.target.value)}
                  placeholder="Buscar por nome ou ID…"
                  aria-label="Buscar grupos"
                  className="pl-9"
                />
                {groupQuery ? (
                  <button
                    type="button"
                    onClick={() => setGroupQuery('')}
                    aria-label="Limpar busca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-slate-300"
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {visibleGroups.length === 0 ? (
                <EmptyState
                  title="Nenhum grupo encontrado"
                  description="Tente outro termo de busca."
                />
              ) : (
                <ul className="max-h-80 divide-y divide-slate-800 overflow-y-auto">
                  {visibleGroups.map((group) => (
                    <li key={group.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{group.subject}</p>
                        <p className="truncate text-xs text-slate-500">{group.id}</p>
                      </div>
                      <Badge tone="slate">{group.participants_count} membros</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card title="Sistema">
          {system.data ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase text-slate-500">Versão</dt>
                <dd className="mt-0.5 text-slate-300">{system.data.version}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Node.js</dt>
                <dd className="mt-0.5 text-slate-300">{system.data.node}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Timezone</dt>
                <dd className="mt-0.5 text-slate-300">{system.data.timezone}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Uptime</dt>
                <dd className="mt-0.5 text-slate-300">
                  {formatUptime(system.data.uptime_seconds)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Banco de dados</dt>
                <dd className="mt-0.5">
                  {system.data.database === 'ok' ? (
                    <Badge tone="emerald">OK</Badge>
                  ) : (
                    <Badge tone="rose">Erro</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Frontend</dt>
                <dd className="mt-0.5">
                  {system.data.web_built ? (
                    <Badge tone="emerald">Build disponível</Badge>
                  ) : (
                    <Badge tone="amber">Não compilado</Badge>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <Spinner />
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Alert tone="amber" title="Integração não oficial">
          Este sistema usa a biblioteca Baileys, que não é afiliada ao WhatsApp. Instabilidades,
          mudanças no protocolo e restrições de conta podem ocorrer. Utilize um número dedicado e
          mantenha o volume de mensagens baixo.
        </Alert>
      </div>
    </>
  )
}
