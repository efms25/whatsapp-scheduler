import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeSlots, nextOccurrence } from '../../src/scheduler/occurrences.js'

const SCHEDULE_BASE = {
  start_date: null,
  end_date: null,
  timezone: 'America/Bahia',
}

describe('computeSlots', () => {
  it('gera ocorrência no horário local convertido para UTC', () => {
    const slots = computeSlots(
      { ...SCHEDULE_BASE, days_of_week: [1], execution_time: '08:00' },
      new Date('2026-11-23T10:00:00.000Z'),
      new Date('2026-11-23T12:00:00.000Z'),
    )

    assert.equal(slots.length, 1)
    assert.equal(slots[0]?.toISOString(), '2026-11-23T11:00:00.000Z')
  })

  it('respeita múltiplos dias da semana', () => {
    const slots = computeSlots(
      { ...SCHEDULE_BASE, days_of_week: [1, 2, 3, 4, 5, 6, 7], execution_time: '08:00' },
      new Date('2026-11-23T09:00:00.000Z'),
      new Date('2026-11-25T09:00:00.000Z'),
    )

    assert.deepEqual(
      slots.map((slot) => slot.toISOString()),
      ['2026-11-23T11:00:00.000Z', '2026-11-24T11:00:00.000Z'],
    )
  })

  it('respeita start_date e end_date', () => {
    const slots = computeSlots(
      {
        ...SCHEDULE_BASE,
        days_of_week: [1, 2],
        execution_time: '08:00',
        start_date: '2026-11-24',
        end_date: '2026-11-24',
      },
      new Date('2026-11-23T09:00:00.000Z'),
      new Date('2026-11-25T09:00:00.000Z'),
    )

    assert.deepEqual(
      slots.map((slot) => slot.toISOString()),
      ['2026-11-24T11:00:00.000Z'],
    )
  })

  it('ignora horário inexistente no DST (spring forward)', () => {
    const slots = computeSlots(
      {
        days_of_week: [7],
        execution_time: '02:30',
        start_date: null,
        end_date: null,
        timezone: 'America/New_York',
      },
      new Date('2026-03-08T05:00:00.000Z'),
      new Date('2026-03-09T04:00:00.000Z'),
    )

    assert.equal(slots.length, 0)
  })

  it('gera apenas uma ocorrência no horário ambíguo do DST (fall back)', () => {
    const slots = computeSlots(
      {
        days_of_week: [7],
        execution_time: '01:30',
        start_date: null,
        end_date: null,
        timezone: 'America/New_York',
      },
      new Date('2026-11-01T04:00:00.000Z'),
      new Date('2026-11-02T05:00:00.000Z'),
    )

    assert.equal(slots.length, 1)
  })

  it('não gera ocorrências fora do intervalo', () => {
    const slots = computeSlots(
      { ...SCHEDULE_BASE, days_of_week: [1], execution_time: '08:00' },
      new Date('2026-11-23T11:00:00.000Z'),
      new Date('2026-11-23T11:30:00.000Z'),
    )

    assert.equal(slots.length, 0)
  })
})

describe('nextOccurrence', () => {
  it('encontra a próxima execução a partir de um instante', () => {
    const next = nextOccurrence(
      { ...SCHEDULE_BASE, days_of_week: [1], execution_time: '08:00' },
      new Date('2026-11-23T12:00:00.000Z'),
    )

    assert.equal(next?.toISOString(), '2026-11-30T11:00:00.000Z')
  })
})
