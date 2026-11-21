import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'

import { fileTypeFromBuffer } from 'file-type'

import { BadRequestError } from '../errors/http-error.js'
import type { UploadedFile } from './multipart.js'

export type MediaKind = 'image' | 'audio'

export interface StoredMedia {
  media_path: string
  media_mime_type: string
  media_original_name: string
  size: number
}

export interface MediaStore {
  readonly root: string
  readonly maxBytes: number
  save(file: UploadedFile, kind: MediaKind): Promise<StoredMedia>
  resolve(relativeName: string | null): string | null
  remove(relativeName: string | null): void
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
])

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'ogg', 'oga', 'opus', 'm4a', 'mp4', 'aac'])

export function createMediaStore(root: string, maxBytes: number): MediaStore {
  const absoluteRoot = resolve(root)
  mkdirSync(absoluteRoot, { recursive: true })

  function resolveSafe(relativeName: string | null): string | null {
    if (!relativeName) return null

    const absolute = resolve(absoluteRoot, basename(relativeName))

    if (absolute !== absoluteRoot && !absolute.startsWith(absoluteRoot + sep)) return null

    return existsSync(absolute) ? absolute : null
  }

  return {
    root: absoluteRoot,
    maxBytes,

    async save(file: UploadedFile, kind: MediaKind): Promise<StoredMedia> {
      if (file.buffer.length === 0) {
        throw new BadRequestError('Uploaded file is empty')
      }

      if (file.buffer.length > maxBytes) {
        throw new BadRequestError(
          `File exceeds the limit of ${Math.round(maxBytes / (1024 * 1024))} MB`,
        )
      }

      const detected = await fileTypeFromBuffer(file.buffer)

      if (!detected) {
        throw new BadRequestError('Unable to determine the file type')
      }

      if (kind === 'image' && !IMAGE_MIME_TYPES.has(detected.mime)) {
        throw new BadRequestError(
          `Unsupported image type "${detected.mime}". Allowed: JPEG, PNG and WebP`,
        )
      }

      if (kind === 'audio' && !AUDIO_MIME_TYPES.has(detected.mime)) {
        throw new BadRequestError(
          `Unsupported audio type "${detected.mime}". Allowed: MP3, OGG/Opus, M4A/AAC`,
        )
      }

      if (kind === 'image' && !IMAGE_EXTENSIONS.has(detected.ext)) {
        throw new BadRequestError(`Unsupported image extension ".${detected.ext}"`)
      }

      if (kind === 'audio' && !AUDIO_EXTENSIONS.has(detected.ext)) {
        throw new BadRequestError(`Unsupported audio extension ".${detected.ext}"`)
      }

      const mediaPath = `${randomUUID()}.${detected.ext}`
      const destination = join(absoluteRoot, mediaPath)

      writeFileSync(destination, file.buffer, { mode: 0o600 })

      return {
        media_path: mediaPath,
        media_mime_type: detected.mime,
        media_original_name: sanitizeFilename(file.filename),
        size: file.buffer.length,
      }
    },

    resolve(relativeName: string | null): string | null {
      return resolveSafe(relativeName)
    },

    remove(relativeName: string | null): void {
      const absolute = resolveSafe(relativeName)
      if (!absolute) return
      rmSync(absolute, { force: true })
    },
  }
}

function sanitizeFilename(filename: string): string {
  const cleaned = basename(filename)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 200)

  return cleaned.length > 0 ? cleaned : 'file'
}
