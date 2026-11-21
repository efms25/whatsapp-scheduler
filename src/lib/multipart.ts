import type { FastifyRequest } from 'fastify'

import { BadRequestError, PayloadTooLargeError } from '../errors/http-error.js'

export interface UploadedFile {
  filename: string
  mimetype: string
  buffer: Buffer
}

export interface MultipartPayload {
  fields: Record<string, string>
  file?: UploadedFile
}

interface ReadMultipartOptions {
  maxBytes: number
}

/**
 * Lê um multipart simples (campos texto + no máximo um arquivo).
 * O arquivo fica em memória: o limite de tamanho é baixo (16 MB por padrão).
 */
export async function readMultipart(
  request: FastifyRequest,
  options: ReadMultipartOptions,
): Promise<MultipartPayload> {
  const fields: Record<string, string> = {}
  let file: UploadedFile | undefined

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (file) {
          // Consome o stream para não travar o parser.
          await part.toBuffer()
          throw new BadRequestError('Only one file per request is allowed')
        }

        const buffer = await part.toBuffer()

        if (buffer.length > options.maxBytes) {
          throw new PayloadTooLargeError(
            `File exceeds the limit of ${Math.round(options.maxBytes / (1024 * 1024))} MB`,
          )
        }

        if (buffer.length === 0) {
          throw new BadRequestError(`Empty file for field "${part.fieldname}"`)
        }

        file = {
          filename: part.filename ?? 'file',
          mimetype: part.mimetype,
          buffer,
        }
        continue
      }

      if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value
      }
    }
  } catch (error) {
    if (isFileTooLarge(error)) {
      throw new PayloadTooLargeError(
        `File exceeds the limit of ${Math.round(options.maxBytes / (1024 * 1024))} MB`,
      )
    }
    throw error
  }

  return file ? { fields, file } : { fields }
}

function isFileTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT'
}
