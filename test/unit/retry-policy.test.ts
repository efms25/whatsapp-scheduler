import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canRetry, retryDelayMs, RETRY_DELAYS_MS } from '../../src/scheduler/retry-policy.js'

describe('retry-policy', () => {
  it('respeita o número máximo de tentativas', () => {
    assert.equal(canRetry(1, 3), true)
    assert.equal(canRetry(2, 3), true)
    assert.equal(canRetry(3, 3), false)
  })

  it('aplica backoff crescente e limita ao último intervalo', () => {
    assert.equal(retryDelayMs(1), RETRY_DELAYS_MS[0])
    assert.equal(retryDelayMs(2), RETRY_DELAYS_MS[1])
    assert.equal(retryDelayMs(99), RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1])
  })
})
