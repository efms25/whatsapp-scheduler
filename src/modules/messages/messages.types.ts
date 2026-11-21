export type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO'

export interface Message {
  id: string
  title: string
  content: string | null
  message_type: MessageType
  media_path: string | null
  media_mime_type: string | null
  media_original_name: string | null
  group_id: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MessageInput {
  title: string
  content: string | null
  message_type: MessageType
  media_path: string | null
  media_mime_type: string | null
  media_original_name: string | null
  group_id: string
  is_active: boolean
}

export interface MessageRow {
  id: string
  title: string
  content: string | null
  message_type: MessageType
  media_path: string | null
  media_mime_type: string | null
  media_original_name: string | null
  group_id: string
  is_active: number
  created_at: string
  updated_at: string
}

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    message_type: row.message_type,
    media_path: row.media_path,
    media_mime_type: row.media_mime_type,
    media_original_name: row.media_original_name,
    group_id: row.group_id,
    is_active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
