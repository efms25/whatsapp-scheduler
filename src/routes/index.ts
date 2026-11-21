import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { AppContext } from '../context.js'
import { executionsRoutes } from '../modules/executions/executions.routes.js'
import { messagesRoutes } from '../modules/messages/messages.routes.js'
import { schedulesRoutes } from '../modules/schedules/schedules.routes.js'
import { systemRoutes } from '../modules/system/system.routes.js'
import { whatsappRoutes } from '../modules/whatsapp/whatsapp.routes.js'

export function apiRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    await app.register(messagesRoutes(ctx), { prefix: '/messages' })
    await app.register(schedulesRoutes(ctx), { prefix: '/schedules' })
    await app.register(executionsRoutes(ctx), { prefix: '/executions' })
    await app.register(whatsappRoutes(ctx), { prefix: '/whatsapp' })
    await app.register(systemRoutes(ctx))
  }
}
