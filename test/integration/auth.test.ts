import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { authHeaders, createTestApp } from '../helpers/test-app.js'

describe('authentication', () => {
  it('exige Basic Auth na API e no frontend', async () => {
    const { app, close } = await createTestApp()

    try {
      const missing = await app.inject({ method: 'GET', url: '/api/messages' })

      assert.equal(missing.statusCode, 401)
      assert.equal(missing.json().error.code, 'UNAUTHORIZED')
      assert.match(String(missing.headers['www-authenticate'] ?? ''), /Basic/)

      const wrong = await app.inject({
        method: 'GET',
        url: '/api/messages',
        headers: {
          authorization: `Basic ${Buffer.from('admin:wrong').toString('base64')}`,
        },
      })
      assert.equal(wrong.statusCode, 401)

      const authorized = await app.inject({
        method: 'GET',
        url: '/api/messages',
        headers: authHeaders,
      })
      assert.equal(authorized.statusCode, 200)

      const spa = await app.inject({ method: 'GET', url: '/' })
      assert.equal(spa.statusCode, 401)

      const docs = await app.inject({ method: 'GET', url: '/docs' })
      assert.equal(docs.statusCode, 401)

      const csrf = await app.inject({
        method: 'POST',
        url: '/api/messages',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
        payload: { title: 'csrf' },
      })

      assert.equal(csrf.statusCode, 403)
      assert.equal(csrf.json().error.code, 'CSRF_BLOCKED')
    } finally {
      await close()
    }
  })

  it('mantém o health check público', async () => {
    const { app, close } = await createTestApp()

    try {
      const health = await app.inject({ method: 'GET', url: '/api/health' })

      assert.equal(health.statusCode, 200)
      assert.equal(health.json().status, 'ok')
      assert.equal(health.json().database, 'ok')
      assert.equal(health.json().whatsapp, 'connected')
    } finally {
      await close()
    }
  })
})
