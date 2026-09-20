export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== "string" || !value) {
    throw new SchemaError(`${key} must be a non-empty string`);
  }
  return value;
}

export function requireInt(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new SchemaError(`${key} must be an integer`);
  }
  return value;
}
