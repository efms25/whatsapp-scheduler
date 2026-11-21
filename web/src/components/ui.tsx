import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

export const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-500 text-slate-950 hover:bg-emerald-400 focus-visible:ring-emerald-400/50 disabled:bg-emerald-500/50',
  secondary:
    'border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800 focus-visible:ring-slate-500/40',
  ghost: 'text-slate-300 hover:bg-slate-800/70 hover:text-white focus-visible:ring-slate-500/40',
  danger:
    'border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 focus-visible:ring-rose-500/40',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }): ReactNode {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input className={inputClass} {...props} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  return <textarea className={`${inputClass} min-h-28 resize-y`} {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  return <select className={inputClass} {...props} />
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-slate-300">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

export function Card({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg shadow-slate-950/20 backdrop-blur ${className}`}
    >
      {title || action ? (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title ? <h2 className="text-base font-semibold text-white">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

type BadgeTone = 'emerald' | 'amber' | 'rose' | 'slate' | 'sky' | 'violet'

const badgeTones: Record<BadgeTone, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  slate: 'border-slate-600/50 bg-slate-700/30 text-slate-300',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
}

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: BadgeTone
  children: ReactNode
}): ReactNode {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }): ReactNode {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400 ${className}`}
      role="status"
      aria-label="Carregando"
    />
  )
}

export function Alert({
  tone = 'rose',
  title,
  children,
}: {
  tone?: 'rose' | 'emerald' | 'amber'
  title?: string
  children: ReactNode
}): ReactNode {
  const tones = {
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  }

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description?: string
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
    </div>
  )
}
