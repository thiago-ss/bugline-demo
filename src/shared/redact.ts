/**
 * Redaction runs on both capture and submit paths. It is intentionally
 * conservative: emails, tokens, card-like numbers, query strings, and long
 * opaque strings are replaced with stable placeholders before anything leaves
 * the browser or is persisted by the worker.
 */
export function redact(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    "[email-redacted]",
  );
  out = out.replace(
    /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr|xox[baprs]-)[a-z0-9_-]{8,}\b/gi,
    "[token-redacted]",
  );
  out = out.replace(/\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))[0-9]{12,15}\b/g, "[card-redacted]");
  out = out.replace(/\b\d{13,19}\b/g, "[card-redacted]");
  out = out.replace(/[?&][^#\s]+/g, "");
  out = out.replace(/\b(?:eyJ)[a-zA-Z0-9_-]{20,}\b/g, "[token-redacted]");
  out = out.replace(/\b[a-f0-9]{32,}\b/gi, "[id-redacted]");
  return out;
}

export function redactObject<T>(value: T): T {
  if (typeof value === "string") {
    return redact(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(redactObject) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = redactObject(entry);
    }
    return out as T;
  }
  return value;
}
