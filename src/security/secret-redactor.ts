function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRedactionPatterns(secrets: readonly string[]): RegExp[] {
  return [...new Set(secrets.filter((secret) => secret.length > 0))]
    .sort((left, right) => right.length - left.length)
    .map((secret) => new RegExp(escapeRegExp(secret), "g"));
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  return getRedactionPatterns(secrets).reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), text);
}

export function redactValue<T>(value: T, secrets: readonly string[]): T {
  if (typeof value === "string") {
    return redactSecrets(value, secrets) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      redactValue(entryValue, secrets)
    ]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}
