import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { AppContext } from '../../context.js'
import {
  executionListSchema,
  executionSchema,
  executionStatusSchema,
  executionTypeSchema,
  idParamsSchema,
} from '../../routes/schemas.js'

export function executionsRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/',
      {
        schema: {
          tags: ['executions'],
          summary: 'Lista o histórico de execuções',
          querystring: z.object({
            status: executionStatusSchema.optional(),
            execution_type: executionTypeSchema.optional(),
            message_id: z.string().uuid().optional(),
            limit: z.coerce.number().int().min(1).max(200).default(50),
            offset: z.coerce.number().int().min(0).default(0),
          }),
          response: { 200: executionListSchema },
        },
      },
      async (request) => ctx.services.executions.list(request.query),
    )

    app.get(
      '/:id',
      {
        schema: {
          tags: ['executions'],
          summary: 'Busca uma execução',
          params: idParamsSchema,
          response: { 200: executionSchema },
        },
      },
      async (request) => ctx.services.executions.get(request.params.id),
    )
  }
}
