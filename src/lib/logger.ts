/**
 * Contrato mínimo de logger compatível com Pino/Fastify e com o ILogger do Baileys.
 */
export interface LoggerLike {
  level: string
  child(bindings: Record<string, unknown>, options?: { level?: string }): LoggerLike
  trace(obj: unknown, msg?: string): void
  debug(obj: unknown, msg?: string): void
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
  fatal?(obj: unknown, msg?: string): void
}
