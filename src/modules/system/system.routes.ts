import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { AppContext } from '../../context.js'
import { dashboardSchema, systemInfoSchema } from '../../routes/schemas.js'

export function systemRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/dashboard',
      {
        schema: {
          tags: ['system'],
          summary: 'Resumo para o dashboard',
          response: { 200: dashboardSchema },
        },
      },
      async () => ctx.services.dashboard.get(),
    )

    app.get(
      '/system/info',
      {
        schema: {
          tags: ['system'],
          summary: 'Informações básicas do sistema',
          response: { 200: systemInfoSchema },
        },
      },
      async () => ctx.services.system.info(),
    )
  }
}
