import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { Icon } from './icons'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/messages', label: 'Mensagens', icon: 'messages', end: false },
  { to: '/schedules', label: 'Agendamentos', icon: 'clock', end: false },
  { to: '/send', label: 'Envio manual', icon: 'send', end: false },
  { to: '/settings', label: 'Configurações', icon: 'settings', end: false },
] as const

function Brand(): ReactNode {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
        <Icon name="send" className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold leading-tight text-white">WhatsApp</p>
        <p className="text-xs text-slate-400">Scheduler</p>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800/80 bg-slate-950/60 p-5 md:flex md:flex-col">
        <Brand />

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-emerald-500/10 font-semibold text-emerald-300'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`
              }
            >
              <Icon name={item.icon} className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <p className="mt-6 text-xs leading-relaxed text-slate-600">
          Integração não oficial com o WhatsApp. Use com moderação.
        </p>

        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
        >
          <Icon name="external" className="h-3.5 w-3.5" />
          Documentação da API
        </a>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/60 px-4 py-3 md:hidden">
          <Brand />
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
            aria-label="Documentação da API"
          >
            <Icon name="external" className="h-5 w-5" />
          </a>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg items-stretch justify-between">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition ${
                    isActive ? 'text-emerald-300' : 'text-slate-500'
                  }`
                }
              >
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
