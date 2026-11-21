import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { authHeaders, createTestApp, createTextMessage } from '../helpers/test-app.js'
import { buildMultipart, PNG_1X1 } from '../helpers/multipart.js'

const GROUP_ID = '120363000000000001@g.us'

describe('messages API', () => {
  it('cria, lista e edita uma mensagem de texto', async () => {
    const { app, close } = await createTestApp()

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/messages',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: {
          title: 'Bom dia',
          content: 'Linha 1\nLinha 2',
          message_type: 'TEXT',
          group_id: GROUP_ID,
        },
      })

      assert.equal(created.statusCode, 201)
      const message = created.json()
      assert.equal(message.message_type, 'TEXT')
      assert.equal(message.is_active, true)

      const list = await app.inject({ method: 'GET', url: '/api/messages', headers: authHeaders })
      assert.equal(list.statusCode, 200)
      assert.equal(list.json().total, 1)

      const updated = await app.inject({
        method: 'PUT',
        url: `/api/messages/${message.id}`,
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: { title: 'Bom dia (editada)', is_active: false },
      })

      assert.equal(updated.statusCode, 200)
      assert.equal(updated.json().title, 'Bom dia (editada)')
      assert.equal(updated.json().is_active, false)
      assert.equal(updated.json().content, 'Linha 1\nLinha 2')

      const titleOnly = await app.inject({
        method: 'PUT',
        url: `/api/messages/${message.id}`,
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: { title: 'Somente o título' },
      })

      assert.equal(titleOnly.statusCode, 200)
      assert.equal(titleOnly.json().is_active, false)
    } finally {
      await close()
    }
  })

  it('rejeita texto sem conteúdo e mídia sem arquivo', async () => {
    const { app, close } = await createTestApp()

    try {
      const noContent = await app.inject({
        method: 'POST',
        url: '/api/messages',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: { title: 'Vazia', message_type: 'TEXT', group_id: GROUP_ID },
      })

      assert.equal(noContent.statusCode, 400)

      const noFile = await app.inject({
        method: 'POST',
        url: '/api/messages',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: { title: 'Imagem', message_type: 'IMAGE', group_id: GROUP_ID },
      })

      assert.equal(noFile.statusCode, 400)
      assert.match(noFile.json().error.message, /media file is required/i)
    } finally {
      await close()
    }
  })

  it('faz upload, armazena e serve a mídia', async () => {
    const { app, env, close } = await createTestApp()

    try {
      const multipart = buildMultipart(
        {
          title: 'Imagem',
          content: 'Legenda da imagem',
          message_type: 'IMAGE',
          group_id: GROUP_ID,
          is_active: 'true',
        },
        { filename: 'foto.png', contentType: 'image/png', data: PNG_1X1 },
      )

      const created = await app.inject({
        method: 'POST',
        url: '/api/messages',
        headers: { ...authHeaders, ...multipart.headers },
        payload: multipart.payload,
      })

      assert.equal(created.statusCode, 201)
      const message = created.json()
      assert.equal(message.message_type, 'IMAGE')
      assert.equal(message.content, 'Legenda da imagem')
      assert.equal(message.media_mime_type, 'image/png')
      assert.ok(message.media_path.endsWith('.png'))
      assert.equal(existsSync(join(env.MEDIA_PATH, message.media_path)), true)

      const media = await app.inject({
        method: 'GET',
        url: `/api/messages/${message.id}/media`,
        headers: authHeaders,
      })

      assert.equal(media.statusCode, 200)
      assert.match(media.headers['content-type'] ?? '', /image\/png/)
      assert.equal(media.rawPayload.equals(PNG_1X1), true)

      const unauthorized = await app.inject({
        method: 'GET',
        url: `/api/messages/${message.id}/media`,
      })
      assert.equal(unauthorized.statusCode, 401)
    } finally {
      await close()
    }
  })

  it('rejeita arquivo que não corresponde ao tipo declarado', async () => {
    const { app, close } = await createTestApp()

    try {
      const multipart = buildMultipart(
        {
          title: 'Falsa imagem',
          message_type: 'IMAGE',
          group_id: GROUP_ID,
        },
        {
          filename: 'arquivo.png',
          contentType: 'image/png',
          data: Buffer.from('isto não é uma imagem'),
        },
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/messages',
        headers: { ...authHeaders, ...multipart.headers },
        payload: multipart.payload,
      })

      assert.equal(response.statusCode, 400)
    } finally {
      await close()
    }
  })

  it('bloqueia exclusão com schedule ativo e preserva histórico ao forçar', async () => {
    const { app, ctx, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)

      ctx.services.schedules.create({
        message_id: message.id,
        group_id: GROUP_ID,
        days_of_week: [1, 3, 5],
        execution_time: '18:30',
      })

      const send = await app.inject({
        method: 'POST',
        url: `/api/messages/${message.id}/send`,
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: '{}',
      })
      assert.equal(send.statusCode, 200)
      const execution = send.json()

      const blocked = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${message.id}`,
        headers: authHeaders,
      })

      assert.equal(blocked.statusCode, 409)
      assert.match(blocked.json().error.message, /active schedule/i)

      const forced = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${message.id}?force=true`,
        headers: authHeaders,
      })

      assert.equal(forced.statusCode, 204)
      assert.equal(ctx.services.messages.list().length, 0)
      assert.equal(ctx.services.schedules.list().length, 0)

      const history = await app.inject({
        method: 'GET',
        url: `/api/executions/${execution.id}`,
        headers: authHeaders,
      })

      assert.equal(history.statusCode, 200)
      assert.equal(history.json().message_id, null)
      assert.equal(history.json().message_title, message.title)
      assert.equal(history.json().status, 'SENT')
    } finally {
      await close()
    }
  })

  it('valida payload de agendamento e lista grupos cacheados', async () => {
    const { app, ctx, close } = await createTestApp()

    try {
      const message = await createTextMessage(ctx)

      const invalidDays = await app.inject({
        method: 'POST',
        url: '/api/schedules',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: {
          message_id: message.id,
          group_id: GROUP_ID,
          days_of_week: [0],
          execution_time: '08:00',
        },
      })

      assert.equal(invalidDays.statusCode, 400)
      assert.equal(invalidDays.json().error.code, 'VALIDATION_ERROR')

      const created = await app.inject({
        method: 'POST',
        url: '/api/schedules',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: {
          message_id: message.id,
          group_id: GROUP_ID,
          days_of_week: [1, 3, 5],
          execution_time: '18:30',
        },
      })

      assert.equal(created.statusCode, 201)
      assert.equal(created.json().days_of_week.length, 3)

      const toggled = await app.inject({
        method: 'PATCH',
        url: `/api/schedules/${created.json().id}/toggle`,
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: '{}',
      })

      assert.equal(toggled.statusCode, 200)
      assert.equal(toggled.json().is_active, false)

      const groups = await app.inject({
        method: 'GET',
        url: '/api/whatsapp/groups',
        headers: authHeaders,
      })

      assert.equal(groups.statusCode, 200)
      assert.equal(groups.json().total, 1)
      assert.equal(groups.json().data[0].subject, 'Grupo de Teste')
    } finally {
      await close()
    }
  })
})
