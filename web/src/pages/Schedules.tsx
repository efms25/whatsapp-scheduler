import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { GroupInput } from '../components/GroupInput'
import { Icon } from '../components/icons'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'
import { api, type Schedule, type SchedulePayload } from '../lib/api'
import { WEEKDAY_LABELS, formatDateTime, formatDays, formatError } from '../lib/format'

const DAYS = [1, 2, 3, 4, 5, 6, 7]

export default function Schedules(): ReactNode {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<Schedule | 'new' | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'emerald' | 'rose'; text: string } | null>(null)

  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => api.schedules.list() })
  const system = useQuery({ queryKey: ['system'], queryFn: api.systemInfo })

  const toggle = useMutation({
    mutationFn: (schedule: Schedule) => api.schedules.toggle(schedule.id, !schedule.is_active),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
    onError: (error) => setFeedback({ tone: 'rose', text: formatError(error) }),
  })

  async function handleDelete(schedule: Schedule): Promise<void> {
    if (!window.confirm(`Excluir o agendamento de "${schedule.message_title}"?`)) return

    try {
      await api.schedules.remove(schedule.id)
      setFeedback({ tone: 'emerald', text: 'Agendamento removido.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    } catch (error) {
      setFeedback({ tone: 'rose', text: formatError(error) })
    }
  }

  if (schedules.isLoading) {
    return (
      <div className="flex items-center gap-3 p-10 text-slate-400">
        <Spinner /> Carregando agendamentos…
      </div>
    )
  }

  const list = schedules.data?.data ?? []
  const timezone = system.data?.timezone ?? 'America/Bahia'

  return (
    <>
      <PageHeader
        title="Agendamentos"
        description="Dias, horários e período de vigência de cada mensagem."
        action={
          <Button onClick={() => setEditor('new')}>
            <Icon name="plus" /> Novo agendamento
          </Button>
        }
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

      {editor ? (
        <div className="mb-6">
          <ScheduleForm
            schedule={editor === 'new' ? undefined : editor}
            defaultTimezone={timezone}
            onClose={() => setEditor(null)}
            onSaved={() => {
              setEditor(null)
              setFeedback({ tone: 'emerald', text: 'Agendamento salvo.' })
            }}
          />
        </div>
      ) : null}

      {schedules.error ? (
        <Alert title="Erro ao carregar agendamentos">{formatError(schedules.error)}</Alert>
      ) : null}

      {list.length === 0 ? (
        <EmptyState
          title="Nenhum agendamento"
          description="Crie um agendamento vinculado a uma mensagem cadastrada."
        />
      ) : (
        <div className="grid gap-4">
          {list.map((schedule) => (
            <Card key={schedule.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{schedule.message_title}</h3>
                    {schedule.is_active ? (
                      <Badge tone="emerald">Ativo</Badge>
                    ) : (
                      <Badge tone="slate">Inativo</Badge>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-slate-300">
                    {formatDays(schedule.days_of_week)} às {schedule.execution_time}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {schedule.timezone} · Grupo: {schedule.group_id}
                  </p>
                  {schedule.start_date || schedule.end_date ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Vigência: {schedule.start_date ?? 'início'} até{' '}
                      {schedule.end_date ?? 'sem fim'}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-emerald-300">
                    Próxima execução: {formatDateTime(schedule.next_run_at, schedule.timezone)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 sm:flex-col">
                  <Button
                    variant="secondary"
                    onClick={() => toggle.mutate(schedule)}
                    disabled={toggle.isPending}
                  >
                    <Icon name="refresh" />
                    {schedule.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditor(schedule)}>
                    <Icon name="pencil" /> Editar
                  </Button>
                  <Button variant="danger" onClick={() => void handleDelete(schedule)}>
                    <Icon name="trash" /> Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function ScheduleForm({
  schedule,
  defaultTimezone,
  onClose,
  onSaved,
}: {
  schedule?: Schedule
  defaultTimezone: string
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const queryClient = useQueryClient()
  const messages = useQuery({ queryKey: ['messages'], queryFn: () => api.messages.list() })

  const [messageId, setMessageId] = useState(schedule?.message_id ?? '')
  const [groupId, setGroupId] = useState(schedule?.group_id ?? '')
  const [days, setDays] = useState<number[]>(schedule?.days_of_week ?? [1])
  const [time, setTime] = useState(schedule?.execution_time ?? '08:00')
  const [startDate, setStartDate] = useState(schedule?.start_date ?? '')
  const [endDate, setEndDate] = useState(schedule?.end_date ?? '')
  const [timezone, setTimezone] = useState(schedule?.timezone ?? defaultTimezone)
  const [isActive, setIsActive] = useState(schedule?.is_active ?? true)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!messageId && messages.data?.data.length) {
      const first = messages.data.data[0]
      if (first) {
        setMessageId(first.id)
        setGroupId((current) => current || first.group_id)
      }
    }
  }, [messageId, messages.data])

  const mutation = useMutation({
    mutationFn: (payload: SchedulePayload) =>
      schedule ? api.schedules.update(schedule.id, payload) : api.schedules.create(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      onSaved()
    },
  })

  function changeMessage(id: string): void {
    setMessageId(id)
    const selected = messages.data?.data.find((message) => message.id === id)
    if (selected && !schedule) setGroupId(selected.group_id)
  }

  function toggleDay(day: number): void {
    setDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    )
  }

  function submit(): void {
    setLocalError(null)

    if (!messageId) {
      setLocalError('Selecione uma mensagem.')
      return
    }

    if (!groupId.trim()) {
      setLocalError('Informe o grupo de destino.')
      return
    }

    if (days.length === 0) {
      setLocalError('Selecione pelo menos um dia da semana.')
      return
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setLocalError('Horário inválido. Use HH:mm.')
      return
    }

    mutation.mutate({
      message_id: messageId,
      group_id: groupId.trim(),
      days_of_week: [...days].sort((a, b) => a - b),
      execution_time: time,
      start_date: startDate || null,
      end_date: endDate || null,
      timezone,
      is_active: isActive,
    })
  }

  return (
    <Card
      title={schedule ? 'Editar agendamento' : 'Novo agendamento'}
      action={
        <Button variant="ghost" onClick={onClose}>
          <Icon name="x" /> Fechar
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Mensagem">
          <Select value={messageId} onChange={(event) => changeMessage(event.target.value)}>
            <option value="">Selecione…</option>
            {messages.data?.data.map((message) => (
              <option key={message.id} value={message.id}>
                {message.title} {message.is_active ? '' : '(desativada)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Grupo de destino">
          <GroupInput
            value={groupId}
            onChange={setGroupId}
            id={`schedule-group-${schedule?.id ?? 'new'}`}
          />
        </Field>

        <Field label="Dias da semana" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => {
              const selected = days.includes(day)

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    selected
                      ? 'border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-300'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {WEEKDAY_LABELS[day]}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Horário" hint="Formato 24h (HH:mm)">
          <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </Field>

        <Field label="Timezone" hint="IANA, ex.: America/Bahia">
          <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </Field>

        <Field label="Início (opcional)">
          <Input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>

        <Field label="Fim (opcional)">
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-500"
          />
          Agendamento ativo
        </label>

        {localError ? (
          <div className="md:col-span-2">
            <Alert>{localError}</Alert>
          </div>
        ) : null}

        {mutation.error ? (
          <div className="md:col-span-2">
            <Alert title="Não foi possível salvar">{formatError(mutation.error)}</Alert>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Spinner className="h-4 w-4 border-slate-900/40 border-t-slate-900" />
            ) : (
              <Icon name="check" />
            )}
            Salvar
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Card>
  )
}
