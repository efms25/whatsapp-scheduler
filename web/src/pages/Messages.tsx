import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

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
  Textarea,
} from '../components/ui'
import { api, ApiError, mediaUrl, type Message, type MessageType } from '../lib/api'
import { formatError } from '../lib/format'

interface Feedback {
  tone: 'emerald' | 'rose'
  text: string
}

export default function Messages(): ReactNode {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<Message | 'new' | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const messages = useQuery({ queryKey: ['messages'], queryFn: () => api.messages.list() })

  const sendNow = useMutation({
    mutationFn: (message: Message) => api.messages.send(message.id),
    onSuccess: (execution) => {
      setFeedback({
        tone: execution.status === 'SENT' ? 'emerald' : 'rose',
        text:
          execution.status === 'SENT'
            ? 'Mensagem enviada com sucesso.'
            : (execution.error_message ?? 'Falha no envio.'),
      })
      void queryClient.invalidateQueries({ queryKey: ['executions'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => setFeedback({ tone: 'rose', text: formatError(error) }),
  })

  async function handleDelete(message: Message): Promise<void> {
    if (!window.confirm(`Excluir a mensagem "${message.title}"?`)) return

    try {
      await api.messages.remove(message.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const confirmed = window.confirm(
          'Esta mensagem possui agendamentos ativos. Excluir mesmo assim? Os agendamentos também serão removidos.',
        )
        if (!confirmed) return

        try {
          await api.messages.remove(message.id, true)
        } catch (forceError) {
          setFeedback({ tone: 'rose', text: formatError(forceError) })
          return
        }
      } else {
        setFeedback({ tone: 'rose', text: formatError(error) })
        return
      }
    }

    setFeedback({ tone: 'emerald', text: 'Mensagem removida.' })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['messages'] }),
      queryClient.invalidateQueries({ queryKey: ['schedules'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }

  if (messages.isLoading) {
    return (
      <div className="flex items-center gap-3 p-10 text-slate-400">
        <Spinner /> Carregando mensagens…
      </div>
    )
  }

  const list = messages.data?.data ?? []

  return (
    <>
      <PageHeader
        title="Mensagens"
        description="Cadastre textos, imagens e áudios para enviar aos grupos."
        action={
          <Button onClick={() => setEditor('new')}>
            <Icon name="plus" /> Nova mensagem
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
          <MessageForm
            message={editor === 'new' ? undefined : editor}
            onClose={() => setEditor(null)}
            onSaved={(message) => {
              setEditor(null)
              setFeedback({
                tone: 'emerald',
                text: `Mensagem "${message.title}" salva.`,
              })
            }}
          />
        </div>
      ) : null}

      {messages.error ? (
        <Alert title="Erro ao carregar mensagens">{formatError(messages.error)}</Alert>
      ) : null}

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma mensagem cadastrada"
          description="Clique em “Nova mensagem” para começar."
        />
      ) : (
        <div className="grid gap-4">
          {list.map((message) => {
            const media = mediaUrl(message)

            return (
              <Card key={message.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  {media && message.message_type === 'IMAGE' ? (
                    <img
                      src={media}
                      alt={message.title}
                      className="h-32 w-full rounded-xl border border-slate-800 object-cover lg:w-44"
                    />
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-white">{message.title}</h3>
                      <Badge tone="sky">{message.message_type}</Badge>
                      {!message.is_active ? <Badge tone="amber">Desativada</Badge> : null}
                    </div>

                    {message.content ? (
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-300">
                        {message.content}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">Sem texto.</p>
                    )}

                    <p className="mt-2 text-xs text-slate-500">Grupo: {message.group_id}</p>

                    {media && message.message_type === 'AUDIO' ? (
                      <audio controls src={media} className="mt-3 w-full max-w-md">
                        <track kind="captions" />
                      </audio>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:flex-col">
                    <Button
                      variant="secondary"
                      onClick={() => sendNow.mutate(message)}
                      disabled={sendNow.isPending}
                    >
                      <Icon name="send" /> Enviar agora
                    </Button>
                    <Button variant="ghost" onClick={() => setEditor(message)}>
                      <Icon name="pencil" /> Editar
                    </Button>
                    <Button variant="danger" onClick={() => void handleDelete(message)}>
                      <Icon name="trash" /> Excluir
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function MessageForm({
  message,
  onClose,
  onSaved,
}: {
  message?: Message
  onClose: () => void
  onSaved: (message: Message) => void
}): ReactNode {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(message?.title ?? '')
  const [type, setType] = useState<MessageType>(message?.message_type ?? 'TEXT')
  const [groupId, setGroupId] = useState(message?.group_id ?? '')
  const [content, setContent] = useState(message?.content ?? '')
  const [isActive, setIsActive] = useState(message?.is_active ?? true)
  const [file, setFile] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setObjectUrl(null)
      return
    }

    const url = URL.createObjectURL(file)
    setObjectUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [file])

  const existingMedia = message ? mediaUrl(message) : null
  const previewUrl = objectUrl ?? existingMedia

  const mutation = useMutation({
    mutationFn: (form: FormData) =>
      message ? api.messages.update(message.id, form) : api.messages.create(form),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      onSaved(saved)
    },
  })

  const fileAccept = useMemo(
    () =>
      type === 'IMAGE'
        ? 'image/jpeg,image/png,image/webp'
        : 'audio/mpeg,audio/ogg,audio/mp4,audio/aac',
    [type],
  )

  function submit(): void {
    setLocalError(null)

    if (!title.trim()) {
      setLocalError('Informe um título.')
      return
    }

    if (!groupId.trim()) {
      setLocalError('Informe o grupo de destino.')
      return
    }

    if (type === 'TEXT' && !content.trim()) {
      setLocalError('Mensagens de texto precisam de conteúdo.')
      return
    }

    if (type !== 'TEXT' && !file && (!message?.media_path || message.message_type !== type)) {
      setLocalError('Selecione um arquivo de mídia.')
      return
    }

    const form = new FormData()
    form.set('title', title.trim())
    form.set('content', content)
    form.set('message_type', type)
    form.set('group_id', groupId.trim())
    form.set('is_active', isActive ? 'true' : 'false')

    if (file) form.set('file', file)

    mutation.mutate(form)
  }

  return (
    <Card
      title={message ? 'Editar mensagem' : 'Nova mensagem'}
      action={
        <Button variant="ghost" onClick={onClose}>
          <Icon name="x" /> Fechar
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Título">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Lembrete de reunião"
            maxLength={200}
          />
        </Field>

        <Field label="Tipo">
          <Select value={type} onChange={(event) => setType(event.target.value as MessageType)}>
            <option value="TEXT">Texto</option>
            <option value="IMAGE">Imagem</option>
            <option value="AUDIO">Áudio</option>
          </Select>
        </Field>

        <Field
          label="Grupo de destino"
          hint="Use a lista de grupos conectados ou cole o ID do grupo."
          className="md:col-span-2"
        >
          <GroupInput
            value={groupId}
            onChange={setGroupId}
            id={`message-group-${message?.id ?? 'new'}`}
          />
        </Field>

        <Field
          label={
            type === 'IMAGE'
              ? 'Legenda (opcional)'
              : type === 'AUDIO'
                ? 'Observação interna (opcional, não é enviada)'
                : 'Conteúdo'
          }
          className="md:col-span-2"
        >
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={type === 'TEXT' ? 'Texto da mensagem…' : 'Legenda opcional…'}
            maxLength={4000}
          />
        </Field>

        {type !== 'TEXT' ? (
          <Field
            label={message?.media_path ? 'Substituir arquivo (opcional)' : 'Arquivo'}
            hint={
              type === 'IMAGE'
                ? 'JPEG, PNG ou WebP (máx. 16 MB)'
                : 'MP3, OGG/Opus, M4A/AAC (máx. 16 MB)'
            }
            className="md:col-span-2"
          >
            <input
              type="file"
              accept={fileAccept}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-300"
            />
          </Field>
        ) : null}

        {previewUrl && type === 'IMAGE' ? (
          <img
            src={previewUrl}
            alt="Prévia"
            className="max-h-64 w-full rounded-xl border border-slate-800 object-contain md:col-span-2"
          />
        ) : null}

        {previewUrl && type === 'AUDIO' ? (
          <audio controls src={previewUrl} className="w-full md:col-span-2">
            <track kind="captions" />
          </audio>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-500"
          />
          Mensagem ativa para agendamentos
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
