import basicAuth from '@fastify/basic-auth'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

import type { Env } from './config/env.js'
import type { Clock } from './lib/clock.js'
import { createContext, type AppContext } from './context.js'
import type { WhatsAppProvider } from './modules/whatsapp/whatsapp.port.js'
import { AUTH_REALM, createBasicAuthValidate } from './plugins/auth.js'
import { errorHandlerPlugin } from './plugins/error-handler.js'
import { spaPlugin } from './plugins/spa.js'
import { healthRoutes } from './modules/system/health.routes.js'
import { apiRoutes } from './routes/index.js'

export const API_PREFIX = '/api'

export interface CreateAppOptions {
  provider?: WhatsAppProvider
  clock?: Clock
}

export interface CreatedApp {
  app: FastifyInstance
  ctx: AppContext
}

function buildLoggerOptions(env: Env): NonNullable<FastifyServerOptions['logger']> {
  if (env.NODE_ENV === 'test') return false

  return {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname',
              singleLine: true,
            },
          },
        }
      : {}),
  }
}

export async function createApp(env: Env, options: CreateAppOptions = {}): Promise<CreatedApp> {
  const app = Fastify({
    trustProxy: true,
    logger: buildLoggerOptions(env),
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(helmet, {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Swagger UI usa scripts/estilos inline; o painel é protegido por Basic Auth.
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })

  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
      fields: 30,
    },
  })

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'WhatsApp Scheduler API',
        description:
          'API de agendamento e envio de mensagens para grupos do WhatsApp. Integração não oficial via Baileys.',
        version: '0.1.0',
      },
      servers: [
        {
          url: env.PUBLIC_URL ?? '/',
          description: env.PUBLIC_URL ? 'Public' : 'Same origin',
        },
      ],
      tags: [
        { name: 'messages', description: 'Cadastro e envio manual de mensagens' },
        { name: 'schedules', description: 'Agendamentos recorrentes' },
        { name: 'executions', description: 'Histórico de execuções' },
        { name: 'whatsapp', description: 'Conexão, QR Code e grupos' },
        { name: 'system', description: 'Dashboard, health e informações' },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(errorHandlerPlugin)

  const ctx = await createContext(env, {
    logger: app.log,
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.clock ? { clock: options.clock } : {}),
  })

  await app.register(healthRoutes(ctx))

  await app.register(async (scope) => {
    // Rate limit antes da autenticação: tentativas de senha inválida também contam.
    await scope.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: '1 minute',
    })

    await scope.register(basicAuth, {
      authenticate: { realm: AUTH_REALM },
      validate: createBasicAuthValidate(env),
    })

    scope.addHook('onRequest', scope.basicAuth)

    // Mitiga CSRF em navegadores modernos: bloqueia mutações cross-site.
    scope.addHook('onRequest', async (request, reply) => {
      if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
        return
      }

      if (request.headers['sec-fetch-site'] === 'cross-site') {
        return reply.status(403).send({
          error: { code: 'CSRF_BLOCKED', message: 'Cross-site request blocked' },
        })
      }
    })

    await scope.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        persistAuthorization: true,
      },
    })

    await scope.register(apiRoutes(ctx), { prefix: API_PREFIX })

    await scope.register(spaPlugin, { webDist: env.WEB_DIST_PATH })
  })

  app.addHook('onClose', async () => {
    await ctx.close()
  })

  return { app, ctx }
}
