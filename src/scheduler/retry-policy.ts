export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000]

export function canRetry(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount < maxAttempts
}

export function retryDelayMs(attemptCount: number, delays: number[] = RETRY_DELAYS_MS): number {
  const index = Math.min(Math.max(attemptCount - 1, 0), delays.length - 1)
  return delays[index] ?? delays[delays.length - 1] ?? 60_000
}
