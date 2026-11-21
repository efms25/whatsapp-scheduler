export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom',
}

export function formatDateTime(iso: string | null, timezone?: string): string {
  if (!iso) return '—'

  const date = new Date(iso)

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date)
}

export function formatDays(days: number[]): string {
  if (days.length === 7) return 'Todos os dias'

  return [...days]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day] ?? String(day))
    .join(', ')
}

export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) return `${hours}h ${minutes}min`

  return `${minutes}min`
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message

  return String(error)
}
