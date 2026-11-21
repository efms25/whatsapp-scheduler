import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { AppContext } from '../../context.js'
import {
  whatsappGroupListSchema,
  whatsappQrSchema,
  whatsappStatusSchema,
} from '../../routes/schemas.js'

export function whatsappRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/status',
      {
        schema: {
          tags: ['whatsapp'],
          summary: 'Status da conexão com o WhatsApp',
          response: { 200: whatsappStatusSchema },
        },
      },
      async () => ctx.services.whatsapp.status(),
    )

    app.get(
      '/qr',
      {
        schema: {
          tags: ['whatsapp'],
          summary: 'QR Code atual (quando autenticação é necessária)',
          response: { 200: whatsappQrSchema },
        },
      },
      async () => ctx.services.whatsapp.qr(),
    )

    app.get(
      '/groups',
      {
        schema: {
          tags: ['whatsapp'],
          summary: 'Lista grupos do WhatsApp (cache local)',
          querystring: z.object({
            refresh: z.enum(['true', 'false', '1', '0']).optional(),
          }),
          response: { 200: whatsappGroupListSchema },
        },
      },
      async (request) => {
        const refresh = request.query.refresh === 'true' || request.query.refresh === '1'
        const data = await ctx.services.whatsapp.groupsList(refresh)

        return { data, total: data.length }
      },
    )

    app.post(
      '/groups/refresh',
      {
        schema: {
          tags: ['whatsapp'],
          summary: 'Sincroniza a lista de grupos com o WhatsApp',
          response: { 200: whatsappGroupListSchema },
        },
      },
      async () => {
        const data = await ctx.services.whatsapp.groupsList(true)

        return { data, total: data.length }
      },
    )

    app.post(
      '/reconnect',
      {
        schema: {
          tags: ['whatsapp'],
          summary: 'Reconecta (ou gera novo QR após logout)',
          response: { 200: whatsappStatusSchema },
        },
      },
      async () => {
        await ctx.services.whatsapp.reconnect()

        return ctx.services.whatsapp.status()
      },
    )
  }
}
