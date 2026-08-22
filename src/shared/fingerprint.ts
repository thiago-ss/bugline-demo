import type { IssueDraft } from "./contracts";

const KEY_FIELDS = [
  "title",
  "summary",
  "actualBehavior",
  "expectedBehavior",
  "reproductionSteps",
] as const;

/**
 * Fingerprint is derived from the semantic content of a draft only, so a
 * resubmitted report for the same bug produces the same fingerprint. Context
 * is intentionally excluded: browser, build id, viewport, and timestamps vary
 * between sessions but must not split one bug into many duplicates.
 */
export function fingerprintDraft(
  draft: Pick<IssueDraft, (typeof KEY_FIELDS)[number]>,
): string {
  const payload = KEY_FIELDS.map((key) => {
    const value = draft[key];
    const normalized = Array.isArray(value)
      ? value.join("\n")
      : String(value ?? "");
    return `${key}:${normalizeText(normalized)}`;
  }).join("|");
  return hashString(payload);
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|of|to|in|on|for|and|or|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `f${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Normalized token bag used for title/summary similarity ranking. */
export function tokenize(input: string): string[] {
  return normalizeText(input).split(" ").filter(Boolean);
}

export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
