import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), '..'), '')
  const authorization =
    env.BASIC_AUTH_USER && env.BASIC_AUTH_PASS
      ? `Basic ${Buffer.from(`${env.BASIC_AUTH_USER}:${env.BASIC_AUTH_PASS}`).toString('base64')}`
      : undefined

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.PORT ?? '3000'}`,
          changeOrigin: true,
          headers: authorization ? { authorization } : {},
        },
        '/docs': {
          target: `http://127.0.0.1:${env.PORT ?? '3000'}`,
          changeOrigin: true,
          headers: authorization ? { authorization } : {},
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
