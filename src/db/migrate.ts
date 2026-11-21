import type { DB } from './index.js'

export interface Migration {
  version: number
  name: string
  sql: string
}

const initSql = `
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  message_type TEXT NOT NULL CHECK (message_type IN ('TEXT', 'IMAGE', 'AUDIO')),
  media_path TEXT,
  media_mime_type TEXT,
  media_original_name TEXT,
  group_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (message_type = 'TEXT' AND content IS NOT NULL AND length(trim(content)) > 0)
    OR (message_type IN ('IMAGE', 'AUDIO') AND media_path IS NOT NULL)
  )
);

CREATE INDEX idx_messages_created_at ON messages (created_at DESC);
CREATE INDEX idx_messages_group_id ON messages (group_id);

CREATE TABLE whatsapp_groups (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  participants_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  days_of_week TEXT NOT NULL CHECK (json_valid(days_of_week)),
  execution_time TEXT NOT NULL CHECK (execution_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  start_date TEXT,
  end_date TEXT,
  timezone TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX idx_schedules_active ON schedules (is_active);
CREATE INDEX idx_schedules_message_id ON schedules (message_id);

CREATE TABLE execution_history (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  message_id TEXT REFERENCES messages (id) ON DELETE SET NULL,
  message_title TEXT NOT NULL,
  schedule_id TEXT REFERENCES schedules (id) ON DELETE SET NULL,
  group_id TEXT NOT NULL,
  scheduled_for TEXT,
  execution_type TEXT NOT NULL CHECK (execution_type IN ('SCHEDULED', 'MANUAL')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  whatsapp_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (delivery_status IN ('UNKNOWN', 'DELIVERED', 'READ')),
  sent_at TEXT,
  delivered_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_execution_whatsapp_id
  ON execution_history (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX idx_execution_due ON execution_history (status, next_attempt_at);
CREATE INDEX idx_execution_scheduled_for ON execution_history (scheduled_for DESC);
CREATE INDEX idx_execution_message_id ON execution_history (message_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: initSql,
  },
]

export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  )

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    const apply = db.transaction(() => {
      db.exec(migration.sql)
      insertMigration.run(migration.version, migration.name, new Date().toISOString())
    })

    apply()
  }
}
