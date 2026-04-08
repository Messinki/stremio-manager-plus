/**
 * UUID generator — Workers runtime exposes `crypto.randomUUID()`.
 * Wrapped here so callers don't have to know.
 */
export function newId(): string {
  return crypto.randomUUID()
}
