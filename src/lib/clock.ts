export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

/** Relógio manual usado nos testes do scheduler. */
export class MutableClock implements Clock {
  private current: Date

  constructor(iso: string | Date) {
    this.current = typeof iso === 'string' ? new Date(iso) : new Date(iso.getTime())
  }

  now(): Date {
    return new Date(this.current.getTime())
  }

  set(iso: string | Date): void {
    this.current = typeof iso === 'string' ? new Date(iso) : new Date(iso.getTime())
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds)
  }
}
