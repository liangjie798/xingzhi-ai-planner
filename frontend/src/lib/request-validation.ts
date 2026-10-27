/** JSON parsing can succeed with null, arrays or primitives; require an object before field access. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
