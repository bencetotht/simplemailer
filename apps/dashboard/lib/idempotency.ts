import { createHash } from "crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalRequestDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function isMateriallyDifferent(
  existingDigest: string | null | undefined,
  requestDigest: string,
): boolean {
  // Phase 1 intentionally preserves the legacy response for rows created
  // before request digests were recorded.
  return Boolean(existingDigest && existingDigest !== requestDigest);
}
