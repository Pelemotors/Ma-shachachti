const sensitiveKey =
  /^(authorization|cookie|set-cookie|password|passphrase|token|access_token|refresh_token|api[_-]?key|secret|service[_-]?role|connection[_-]?string|private[_-]?url)$/i;

const secretValuePatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g,
  /\bpostgres(?:ql)?:\/\/[^\s]+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

export function redactText(value: string) {
  return secretValuePatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function redactOperationalData(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redactOperationalData(entry, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKey.test(key)
        ? "[REDACTED]"
        : redactOperationalData(entry, seen),
    ]),
  );
}
