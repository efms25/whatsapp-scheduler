import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { GroupInput } from '../components/GroupInput'
import { ExecutionBadge } from '../components/status'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'
import { api, mediaUrl, type Execution, type Message } from '../lib/api'
import { formatDateTime } from '../lib/format'

export default function Send(): ReactNode {
  const queryClient = useQueryClient()
  const messages = useQuery({ queryKey: ['messages'], queryFn: () => api.messages.list() })
  const [selectedId, setSelectedId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [result, setResult] = useState<Execution | null>(null)

  const list = messages.data?.data ?? []
  const selected: Message | undefined = list.find((message) => message.id === selectedId) ?? list[0]

  useEffect(() => {
    if (!selectedId && list.length > 0) {
      setSelectedId(list[0]?.id ?? '')
    }
  }, [list, selectedId])

  useEffect(() => {
    setGroupId(selected?.group_id ?? '')
    setResult(null)
  }, [selected?.id])

  const send = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Selecione uma mensagem')

      return api.messages.send(selected.id, groupId || undefined)
    },
    onSuccess: (execution) => {
      setResult(execution)
      void queryClient.invalidateQueries({ queryKey: ['executions'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  if (messages.isLoading) {
    return (
      <div className="flex items-center gap-3 p-10 text-slate-400">
        <Spinner /> Carregando mensagens…
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <>
        <PageHeader
          title="Envio manual"
          description="Envie uma mensagem registrada imediatamente."
        />
        <EmptyState
          title="Nenhuma mensagem cadastrada"
          description="Cadastre uma mensagem na aba Mensagens para poder enviá-la."
        />
      </>
    )
  }

  const previewUrl = selected ? mediaUrl(selected) : null

  return (
    <>
      <PageHeader
        title="Envio manual"
        description="O envio imediato não altera nem desativa os agendamentos existentes."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card title="Configurar envio">
          <div className="flex flex-col gap-4">
            <Field label="Mensagem">
              <Select
                value={selected?.id ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {list.map((message) => (
                  <option key={message.id} value={message.id}>
                    {message.title} ({message.message_type})
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Grupo de destino"
              hint="Confirme ou altere o grupo apenas para este envio."
            >
              <GroupInput value={groupId} onChange={setGroupId} id="send-group" />
            </Field>

            {selected && !selected.is_active ? (
              <Alert tone="amber">
                Esta mensagem está desativada para agendamentos, mas o envio manual é permitido.
              </Alert>
            ) : null}

            <Button
              onClick={() => send.mutate()}
              disabled={send.isPending || !selected || !groupId}
            >
              {send.isPending ? (
                <Spinner className="h-4 w-4 border-slate-900/40 border-t-slate-900" />
              ) : null}
              Enviar agora
            </Button>

            {send.error ? <Alert title="Falha no envio">{send.error.message}</Alert> : null}

            {result ? (
              <Alert
                tone={result.status === 'SENT' ? 'emerald' : 'rose'}
                title="Resultado do envio"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ExecutionBadge status={result.status} />
                  <span>
                    {result.status === 'SENT'
                      ? `Enviado (${result.whatsapp_message_id ?? 'sem id'})`
                      : (result.error_message ?? 'Não foi possível enviar')}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-80">
                  Execução registrada em {formatDateTime(result.created_at)}
                </p>
              </Alert>
            ) : null}
          </div>
        </Card>

        <Card title="Prévia">
          {selected ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{selected.title}</p>
                <p className="text-xs text-slate-500">{selected.message_type}</p>
              </div>

              {selected.content ? (
                <p className="whitespace-pre-wrap rounded-xl bg-slate-950/60 p-3 text-sm text-slate-200">
                  {selected.content}
                </p>
              ) : (
                <p className="text-sm text-slate-500">Sem texto.</p>
              )}

              {previewUrl && selected.message_type === 'IMAGE' ? (
                <img
                  src={previewUrl}
                  alt={selected.title}
                  className="max-h-80 w-full rounded-xl border border-slate-800 object-contain"
                />
              ) : null}

              {previewUrl && selected.message_type === 'AUDIO' ? (
                <audio controls src={previewUrl} className="w-full">
                  <track kind="captions" />
                </audio>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </>
  )
}
