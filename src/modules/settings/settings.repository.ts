import type { DB } from '../../db/index.js'

export function createSettingsRepository(db: DB) {
  const select = db.prepare('SELECT value FROM settings WHERE key = ?')
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)

  return {
    get(key: string): string | null {
      const row = select.get(key) as { value: string } | undefined
      return row ? row.value : null
    },

    set(key: string, value: string): void {
      upsert.run(key, value, new Date().toISOString())
    },
  }
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>
