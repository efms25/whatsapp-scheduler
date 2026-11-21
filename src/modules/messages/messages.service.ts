import { randomUUID } from 'node:crypto'

import { ConflictError, NotFoundError, ValidationError } from '../../errors/http-error.js'
import type { Clock } from '../../lib/clock.js'
import { isGroupId } from '../../lib/whatsapp-id.js'
import type { ExecutionsRepository } from '../executions/executions.repository.js'
import type { Execution } from '../executions/executions.types.js'
import type { MessagesRepository } from './messages.repository.js'
import type { Message } from './messages.types.js'
import type { DeliveryService } from '../../scheduler/delivery.js'
import type { MediaStore } from '../../lib/media-store.js'
import type { UploadedFile } from '../../lib/multipart.js'

export type { UploadedFile }

export interface CreateMessageInput {
  title: string
  content?: string | null
  message_type: Message['message_type']
  group_id: string
  is_active: boolean
}

export interface UpdateMessageInput {
  title?: string
  content?: string | null
  message_type?: Message['message_type']
  group_id?: string
  is_active?: boolean
}

export interface MessagesServiceDeps {
  messages: MessagesRepository
  executions: ExecutionsRepository
  mediaStore: MediaStore
  delivery: DeliveryService
  clock: Clock
  schedules: { countActiveForMessage(messageId: string): number }
}

export interface MessageMedia {
  absolute_path: string
  mime_type: string
  filename: string
}

export function createMessagesService(deps: MessagesServiceDeps) {
  function get(id: string): Message {
    const message = deps.messages.findById(id)

    if (!message) {
      throw new NotFoundError(`Message ${id} not found`)
    }

    return message
  }

  function assertGroupId(groupId: string): void {
    if (!isGroupId(groupId)) {
      throw new ValidationError('group_id must be a valid WhatsApp group id (e.g. 123456-789@g.us)')
    }
  }

  async function create(
    input: CreateMessageInput,
    file: UploadedFile | undefined,
  ): Promise<Message> {
    assertGroupId(input.group_id)

    const title = input.title.trim()

    if (!title) throw new ValidationError('title is required')

    if (input.message_type === 'TEXT') {
      if (file) throw new ValidationError('TEXT messages cannot have a media file')

      const content = input.content?.trim() ?? ''
      if (!content) throw new ValidationError('content is required for TEXT messages')

      return deps.messages.create({
        title,
        content,
        message_type: 'TEXT',
        media_path: null,
        media_mime_type: null,
        media_original_name: null,
        group_id: input.group_id,
        is_active: input.is_active,
      })
    }

    if (!file) {
      throw new ValidationError(`A media file is required for ${input.message_type} messages`)
    }

    const kind = input.message_type === 'IMAGE' ? 'image' : 'audio'
    const stored = await deps.mediaStore.save(file, kind)

    try {
      return deps.messages.create({
        title,
        content: input.content?.trim() || null,
        message_type: input.message_type,
        media_path: stored.media_path,
        media_mime_type: stored.media_mime_type,
        media_original_name: stored.media_original_name,
        group_id: input.group_id,
        is_active: input.is_active,
      })
    } catch (error) {
      deps.mediaStore.remove(stored.media_path)
      throw error
    }
  }

  async function update(
    id: string,
    input: UpdateMessageInput,
    file: UploadedFile | undefined,
  ): Promise<Message> {
    const current = get(id)

    const messageType = input.message_type ?? current.message_type
    const groupId = input.group_id ?? current.group_id
    const isActive = input.is_active ?? current.is_active
    const title = (input.title ?? current.title).trim()

    assertGroupId(groupId)

    if (!title) throw new ValidationError('title is required')

    let content = input.content !== undefined ? input.content?.trim() || null : current.content
    let mediaPath = current.media_path
    let mediaMimeType = current.media_mime_type
    let mediaOriginalName = current.media_original_name
    let oldMediaToRemove: string | null = null
    let newMediaPath: string | null = null

    if (messageType === 'TEXT') {
      if (file) throw new ValidationError('TEXT messages cannot have a media file')
      if (!content) throw new ValidationError('content is required for TEXT messages')

      if (current.media_path) oldMediaToRemove = current.media_path
      mediaPath = null
      mediaMimeType = null
      mediaOriginalName = null
    } else {
      content = content ?? null

      if (file) {
        const kind = messageType === 'IMAGE' ? 'image' : 'audio'
        const stored = await deps.mediaStore.save(file, kind)

        newMediaPath = stored.media_path
        oldMediaToRemove = current.media_path

        mediaPath = stored.media_path
        mediaMimeType = stored.media_mime_type
        mediaOriginalName = stored.media_original_name
      } else {
        const typeChanged = current.message_type !== messageType || !current.media_path

        if (typeChanged) {
          throw new ValidationError(
            `A media file is required when changing the message to ${messageType}`,
          )
        }
      }
    }

    let updated: Message | null

    try {
      updated = deps.messages.update(id, {
        title,
        content,
        message_type: messageType,
        media_path: mediaPath,
        media_mime_type: mediaMimeType,
        media_original_name: mediaOriginalName,
        group_id: groupId,
        is_active: isActive,
      })
    } catch (error) {
      if (newMediaPath) deps.mediaStore.remove(newMediaPath)
      throw error
    }

    if (!updated) {
      if (newMediaPath) deps.mediaStore.remove(newMediaPath)
      throw new NotFoundError(`Message ${id} not found`)
    }

    if (oldMediaToRemove) deps.mediaStore.remove(oldMediaToRemove)

    return updated
  }

  function remove(id: string, force: boolean): void {
    const message = get(id)
    const activeSchedules = deps.schedules.countActiveForMessage(id)

    if (activeSchedules > 0 && !force) {
      throw new ConflictError(
        `Message has ${activeSchedules} active schedule(s). Disable or remove them, or retry with force=true.`,
      )
    }

    const removed = deps.messages.remove(id)

    if (!removed) {
      throw new NotFoundError(`Message ${id} not found`)
    }

    deps.mediaStore.remove(message.media_path)
  }

  function getMedia(id: string): MessageMedia {
    const message = get(id)

    if (!message.media_path) {
      throw new NotFoundError(`Message ${id} has no media`)
    }

    const absolutePath = deps.mediaStore.resolve(message.media_path)

    if (!absolutePath) {
      throw new NotFoundError(`Media file for message ${id} is missing`)
    }

    return {
      absolute_path: absolutePath,
      mime_type: message.media_mime_type ?? 'application/octet-stream',
      filename: message.media_original_name ?? 'media',
    }
  }

  async function sendNow(id: string, groupId?: string): Promise<Execution> {
    const message = get(id)
    const targetGroup = groupId ?? message.group_id

    assertGroupId(targetGroup)

    const nowIso = deps.clock.now().toISOString()
    const execution = deps.executions.createPending({
      dedupe_key: `manual:${randomUUID()}`,
      message_id: message.id,
      message_title: message.title,
      schedule_id: null,
      group_id: targetGroup,
      scheduled_for: nowIso,
      execution_type: 'MANUAL',
    })

    if (!execution) {
      throw new Error('Failed to create manual execution record')
    }

    return deps.delivery.deliver(execution.id, 'manual')
  }

  return {
    list: () => deps.messages.list(),
    get,
    create,
    update,
    remove,
    getMedia,
    sendNow,
  }
}

export type MessagesService = ReturnType<typeof createMessagesService>
