import { createApp } from './app.js'
import { loadEnv, type Env } from './config/env.js'

// Restringe a permissão padrão dos arquivos criados (SQLite, mídia, sessão).
process.umask(0o077)

function loadEnvironment(): Env {
  try {
    return loadEnv()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

const env = loadEnvironment()
const { app, ctx } = await createApp(env)

try {
  await app.listen({ host: env.HOST, port: env.PORT })
  app.log.info(`API disponível em http://${env.HOST}:${env.PORT}`)
} catch (error) {
  app.log.error({ err: error }, 'failed to start server')
  process.exit(1)
}

await ctx.start()

let shuttingDown = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  app.log.info({ signal }, 'graceful shutdown started')

  try {
    await app.close()
    app.log.info('server closed')
    process.exit(0)
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown')
    process.exit(1)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal)
  })
}

process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandled rejection')
  if (env.NODE_ENV === 'production') process.exit(1)
})

process.on('uncaughtException', (error) => {
  app.log.fatal({ err: error }, 'uncaught exception')
  process.exit(1)
})
