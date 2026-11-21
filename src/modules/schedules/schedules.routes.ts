import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { AppContext } from '../../context.js'
import { idParamsSchema, scheduleListSchema, scheduleSchema } from '../../routes/schemas.js'

const schedulePayloadSchema = z.object({
  message_id: z.string().uuid(),
  group_id: z.string().min(1),
  days_of_week: z.array(z.number().int().min(1).max(7)).min(1),
  execution_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  timezone: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
})

export function schedulesRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/',
      {
        schema: {
          tags: ['schedules'],
          summary: 'Lista agendamentos',
          querystring: z.object({
            message_id: z.string().uuid().optional(),
          }),
          response: { 200: scheduleListSchema },
        },
      },
      async (request) => {
        const all = ctx.services.schedules.list()
        const data = request.query.message_id
          ? all.filter((schedule) => schedule.message_id === request.query.message_id)
          : all

        return { data, total: data.length }
      },
    )

    app.get(
      '/:id',
      {
        schema: {
          tags: ['schedules'],
          summary: 'Busca um agendamento',
          params: idParamsSchema,
          response: { 200: scheduleSchema },
        },
      },
      async (request) => ctx.services.schedules.get(request.params.id),
    )

    app.post(
      '/',
      {
        schema: {
          tags: ['schedules'],
          summary: 'Cria um agendamento',
          body: schedulePayloadSchema,
          response: { 201: scheduleSchema },
        },
      },
      async (request, reply) => {
        const schedule = ctx.services.schedules.create(request.body)

        return reply.status(201).send(schedule)
      },
    )

    app.put(
      '/:id',
      {
        schema: {
          tags: ['schedules'],
          summary: 'Atualiza um agendamento',
          params: idParamsSchema,
          body: schedulePayloadSchema.partial(),
          response: { 200: scheduleSchema },
        },
      },
      async (request) => ctx.services.schedules.update(request.params.id, request.body),
    )

    app.patch(
      '/:id/toggle',
      {
        schema: {
          tags: ['schedules'],
          summary: 'Ativa/desativa um agendamento',
          params: idParamsSchema,
          body: z
            .object({
              is_active: z.boolean().optional(),
            })
            .optional(),
          response: { 200: scheduleSchema },
        },
      },
      async (request) => {
        return ctx.services.schedules.toggle(request.params.id, request.body?.is_active)
      },
    )

    app.delete(
      '/:id',
      {
        schema: {
          tags: ['schedules'],
          summary: 'Remove um agendamento',
          params: idParamsSchema,
        },
      },
      async (request, reply) => {
        ctx.services.schedules.remove(request.params.id)

        return reply.status(204).send()
      },
    )
  }
}
