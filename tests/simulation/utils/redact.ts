const SECRET_KEY_RE =
  /^(authorization|cookie|set-cookie|password|passwd|refresh[_-]?token|access[_-]?token|id[_-]?token|api[_-]?key|apikey|client[_-]?secret|service_role|private[_-]?key|bearer)$/i;

const SECRET_VALUE_RE =
  /(bearer\s+[a-z0-9._~+/=-]+|sk-[a-z0-9]{10,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9._-]+)/gi;

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(SECRET_VALUE_RE, "[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactValue(nested);
    }
    return out;
  }
  return value;
}

export function containsRawSecret(value: unknown): boolean {
  if (typeof value === "string") {
    return new RegExp(SECRET_VALUE_RE.source, "i").test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsRawSecret);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => {
      if (SECRET_KEY_RE.test(key) && nested && nested !== "[REDACTED]") {
        return true;
      }
      return containsRawSecret(nested);
    });
  }
  return false;
}
