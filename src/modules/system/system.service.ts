import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { DB } from '../../db/index.js'
import type { Env } from '../../config/env.js'
import type { WhatsAppStatus } from '../whatsapp/whatsapp.port.js'

export interface SystemInfo {
  version: string
  node: string
  timezone: string
  uptime_seconds: number
  database: 'ok' | 'error'
  whatsapp: WhatsAppStatus['state']
  web_built: boolean
  timestamp: string
}

export interface HealthInfo {
  status: 'ok' | 'degraded'
  database: 'ok' | 'error'
  whatsapp: WhatsAppStatus['state']
  version: string
  uptime_seconds: number
  timestamp: string
}

export interface SystemServiceDeps {
  db: DB
  env: Env
  getWhatsAppStatus(): WhatsAppStatus
}

let cachedVersion: string | null = null

function readVersion(): string {
  if (cachedVersion) return cachedVersion

  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    cachedVersion = typeof parsed.version === 'string' ? parsed.version : '0.1.0'
  } catch {
    cachedVersion = '0.1.0'
  }

  return cachedVersion
}

export function createSystemService(deps: SystemServiceDeps) {
  function databaseOk(): boolean {
    try {
      deps.db.prepare('SELECT 1').get()
      return true
    } catch {
      return false
    }
  }

  return {
    info(): SystemInfo {
      const dbOk = databaseOk()

      return {
        version: readVersion(),
        node: process.version,
        timezone: deps.env.TIMEZONE,
        uptime_seconds: Math.round(process.uptime()),
        database: dbOk ? 'ok' : 'error',
        whatsapp: deps.getWhatsAppStatus().state,
        web_built: existsSync(join(resolve(deps.env.WEB_DIST_PATH), 'index.html')),
        timestamp: new Date().toISOString(),
      }
    },

    health(): HealthInfo {
      const dbOk = databaseOk()

      return {
        status: dbOk ? 'ok' : 'degraded',
        database: dbOk ? 'ok' : 'error',
        whatsapp: deps.getWhatsAppStatus().state,
        version: readVersion(),
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      }
    },
  }
}

export type SystemService = ReturnType<typeof createSystemService>
