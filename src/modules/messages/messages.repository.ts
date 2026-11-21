import { randomUUID } from 'node:crypto'

import type { DB } from '../../db/index.js'
import { type Message, type MessageInput, type MessageRow, mapMessage } from './messages.types.js'

export function createMessagesRepository(db: DB) {
  const selectAll = db.prepare('SELECT * FROM messages ORDER BY created_at DESC')
  const selectById = db.prepare('SELECT * FROM messages WHERE id = ?')
  const insert = db.prepare(`
    INSERT INTO messages (
      id, title, content, message_type, media_path, media_mime_type,
      media_original_name, group_id, is_active, created_at, updated_at
    ) VALUES (
      @id, @title, @content, @message_type, @media_path, @media_mime_type,
      @media_original_name, @group_id, @is_active, @created_at, @updated_at
    )
  `)
  const update = db.prepare(`
    UPDATE messages SET
      title = @title,
      content = @content,
      message_type = @message_type,
      media_path = @media_path,
      media_mime_type = @media_mime_type,
      media_original_name = @media_original_name,
      group_id = @group_id,
      is_active = @is_active,
      updated_at = @updated_at
    WHERE id = @id
  `)
  const remove = db.prepare('DELETE FROM messages WHERE id = ?')
  const countAll = db.prepare('SELECT COUNT(*) AS total FROM messages')
  const countActive = db.prepare('SELECT COUNT(*) AS total FROM messages WHERE is_active = 1')

  function toParams(message: Message): {
    id: string
    title: string
    content: string | null
    message_type: string
    media_path: string | null
    media_mime_type: string | null
    media_original_name: string | null
    group_id: string
    is_active: number
    created_at: string
    updated_at: string
  } {
    return {
      id: message.id,
      title: message.title,
      content: message.content,
      message_type: message.message_type,
      media_path: message.media_path,
      media_mime_type: message.media_mime_type,
      media_original_name: message.media_original_name,
      group_id: message.group_id,
      is_active: message.is_active ? 1 : 0,
      created_at: message.created_at,
      updated_at: message.updated_at,
    }
  }

  return {
    list(): Message[] {
      return (selectAll.all() as MessageRow[]).map(mapMessage)
    },

    findById(id: string): Message | null {
      const row = selectById.get(id) as MessageRow | undefined
      return row ? mapMessage(row) : null
    },

    create(input: MessageInput): Message {
      const now = new Date().toISOString()
      const message: Message = {
        id: randomUUID(),
        ...input,
        created_at: now,
        updated_at: now,
      }

      insert.run(toParams(message))

      return message
    },

    update(id: string, input: MessageInput): Message | null {
      const current = selectById.get(id) as MessageRow | undefined
      if (!current) return null

      const message: Message = {
        id,
        ...input,
        created_at: current.created_at,
        updated_at: new Date().toISOString(),
      }

      update.run(toParams(message))

      return message
    },

    remove(id: string): boolean {
      return remove.run(id).changes === 1
    },

    count(): number {
      return (countAll.get() as { total: number }).total
    },

    countActive(): number {
      return (countActive.get() as { total: number }).total
    },
  }
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>
