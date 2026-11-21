import type { DB } from '../../db/index.js'

export interface WhatsAppGroupRecord {
  id: string
  subject: string
  participants_count: number
  updated_at: string
}

export function createGroupsRepository(db: DB) {
  const selectAll = db.prepare('SELECT * FROM whatsapp_groups ORDER BY subject COLLATE NOCASE ASC')
  const countAll = db.prepare('SELECT COUNT(*) AS total FROM whatsapp_groups')
  const upsert = db.prepare(`
    INSERT INTO whatsapp_groups (id, subject, participants_count, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      subject = excluded.subject,
      participants_count = excluded.participants_count,
      updated_at = excluded.updated_at
  `)

  return {
    list(): WhatsAppGroupRecord[] {
      return selectAll.all() as WhatsAppGroupRecord[]
    },

    count(): number {
      return (countAll.get() as { total: number }).total
    },

    upsertMany(groups: Array<{ id: string; subject: string; participants_count: number }>): void {
      const now = new Date().toISOString()
      const apply = db.transaction(() => {
        for (const group of groups) {
          upsert.run(group.id, group.subject, group.participants_count, now)
        }
      })

      apply()
    },
  }
}

export type GroupsRepository = ReturnType<typeof createGroupsRepository>
