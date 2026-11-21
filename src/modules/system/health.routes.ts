import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { AppContext } from '../../context.js'
import { healthSchema } from '../../routes/schemas.js'

/**
 * Health check público (usado pelo Docker healthcheck).
 */
export function healthRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/api/health',
      {
        schema: {
          tags: ['system'],
          summary: 'Health check público',
          response: { 200: healthSchema },
        },
      },
      async () => ctx.services.system.health(),
    )
  }
}
