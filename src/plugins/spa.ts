import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import fastifyStatic from '@fastify/static'
import type { FastifyPluginAsync } from 'fastify'

export interface SpaPluginOptions {
  webDist: string
}

const ROOT_FILES = ['favicon.ico', 'favicon.svg', 'manifest.webmanifest', 'robots.txt']

/**
 * Serve a build do Vite. Registrado dentro do escopo autenticado.
 */
export const spaPlugin: FastifyPluginAsync<SpaPluginOptions> = async (app, options) => {
  const root = resolve(options.webDist)
  const indexFile = join(root, 'index.html')

  if (!existsSync(indexFile)) {
    app.get('/', async (_request, reply) => {
      return reply.status(503).send({
        error: {
          code: 'WEB_NOT_BUILT',
          message: 'Frontend build not found. Run "npm run build:web" first.',
        },
      })
    })
    return
  }

  await app.register(fastifyStatic, {
    root,
    serve: false,
    decorateReply: true,
  })

  const assetsRoot = join(root, 'assets')

  if (existsSync(assetsRoot)) {
    await app.register(fastifyStatic, {
      root: assetsRoot,
      prefix: '/assets/',
      decorateReply: false,
      index: false,
      maxAge: '7d',
      immutable: true,
    })
  }

  app.get('/', async (_request, reply) => {
    reply.header('Cache-Control', 'no-cache')
    return reply.sendFile('index.html')
  })

  for (const file of ROOT_FILES) {
    if (existsSync(join(root, file))) {
      app.get(`/${file}`, async (_request, reply) => reply.sendFile(file))
    }
  }

  app.all('/*', async (request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/docs')) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Route ${request.method} ${request.url} not found`,
        },
      })
    }

    if (request.method !== 'GET') {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Route not found' },
      })
    }

    reply.header('Cache-Control', 'no-cache')
    return reply.sendFile('index.html')
  })
}
