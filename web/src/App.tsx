import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import Messages from './pages/Messages'
import Schedules from './pages/Schedules'
import Send from './pages/Send'
import Settings from './pages/Settings'

function NotFound(): ReactNode {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-5xl font-bold text-slate-700">404</p>
      <p className="text-sm text-slate-400">Página não encontrada.</p>
    </div>
  )
}

export default function App(): ReactNode {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/send" element={<Send />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
