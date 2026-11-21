import { createReadStream } from 'node:fs'

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { AppContext } from '../../context.js'
import { readMultipart } from '../../lib/multipart.js'
import { parseOrThrow } from '../../lib/validation.js'
import {
  executionSchema,
  idParamsSchema,
  messageListSchema,
  messageSchema,
  messageTypeSchema,
} from '../../routes/schemas.js'

const createJsonSchema = z.object({
  title: z.string().min(1),
  content: z.string().nullish(),
  message_type: messageTypeSchema,
  group_id: z.string().min(1),
  is_active: z.boolean().default(true),
})

const updateJsonSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().nullish(),
  message_type: messageTypeSchema.optional(),
  group_id: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
})

const createFormSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  message_type: messageTypeSchema,
  group_id: z.string().min(1),
  is_active: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
})

const updateFormSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  message_type: messageTypeSchema.optional(),
  group_id: z.string().min(1).optional(),
  is_active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
})

export function messagesRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/',
      {
        schema: {
          tags: ['messages'],
          summary: 'Lista mensagens cadastradas',
          response: { 200: messageListSchema },
        },
      },
      async () => {
        const data = ctx.services.messages.list()
        return { data, total: data.length }
      },
    )

    app.get(
      '/:id',
      {
        schema: {
          tags: ['messages'],
          summary: 'Busca uma mensagem',
          params: idParamsSchema,
          response: { 200: messageSchema },
        },
      },
      async (request) => ctx.services.messages.get(request.params.id),
    )

    app.get(
      '/:id/media',
      {
        schema: {
          tags: ['messages'],
          summary: 'Baixa/visualiza a mídia da mensagem',
          params: idParamsSchema,
        },
      },
      async (request, reply) => {
        const media = ctx.services.messages.getMedia(request.params.id)

        reply.header('Content-Type', media.mime_type)
        reply.header(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
        )
        reply.header('Cache-Control', 'private, max-age=300')

        return reply.send(createReadStream(media.absolute_path))
      },
    )

    app.post(
      '/',
      {
        schema: {
          tags: ['messages'],
          summary: 'Cria uma mensagem (JSON para TEXT, multipart para mídia)',
          response: { 201: messageSchema },
        },
      },
      async (request, reply) => {
        const maxBytes = ctx.env.MAX_UPLOAD_MB * 1024 * 1024

        let input
        let file

        if (request.isMultipart()) {
          const payload = await readMultipart(request, { maxBytes })
          input = parseOrThrow(createFormSchema, payload.fields)
          file = payload.file
        } else {
          input = parseOrThrow(createJsonSchema, request.body)
        }

        const message = await ctx.services.messages.create(
          {
            title: input.title,
            content: 'content' in input ? (input.content ?? null) : null,
            message_type: input.message_type,
            group_id: input.group_id,
            is_active: input.is_active,
          },
          file,
        )

        return reply.status(201).send(message)
      },
    )

    app.put(
      '/:id',
      {
        schema: {
          tags: ['messages'],
          summary: 'Atualiza uma mensagem',
          params: idParamsSchema,
          response: { 200: messageSchema },
        },
      },
      async (request) => {
        const maxBytes = ctx.env.MAX_UPLOAD_MB * 1024 * 1024

        let input
        let file

        if (request.isMultipart()) {
          const payload = await readMultipart(request, { maxBytes })
          input = parseOrThrow(updateFormSchema, payload.fields)
          file = payload.file
        } else {
          input = parseOrThrow(updateJsonSchema, request.body)
        }

        return ctx.services.messages.update(
          request.params.id,
          {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.content !== undefined ? { content: input.content } : {}),
            ...(input.message_type !== undefined ? { message_type: input.message_type } : {}),
            ...(input.group_id !== undefined ? { group_id: input.group_id } : {}),
            ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
          },
          file,
        )
      },
    )

    app.delete(
      '/:id',
      {
        schema: {
          tags: ['messages'],
          summary: 'Remove uma mensagem',
          params: idParamsSchema,
          querystring: z.object({
            force: z.enum(['true', 'false', '1', '0']).optional(),
          }),
        },
      },
      async (request, reply) => {
        const force = request.query.force === 'true' || request.query.force === '1'

        ctx.services.messages.remove(request.params.id, force)

        return reply.status(204).send()
      },
    )

    app.post(
      '/:id/send',
      {
        schema: {
          tags: ['messages'],
          summary: 'Envia uma mensagem imediatamente (envio manual)',
          params: idParamsSchema,
          body: z
            .object({
              group_id: z.string().min(1).optional(),
            })
            .optional(),
          response: { 200: executionSchema },
        },
      },
      async (request) => {
        return ctx.services.messages.sendNow(request.params.id, request.body?.group_id)
      },
    )
  }
}
