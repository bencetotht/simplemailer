import { describe, expect, test } from "vitest";
import { canonicalRequestDigest, isMateriallyDifferent } from "./idempotency";

describe("legacy idempotency request digests", () => {
  test("canonicalizes object key ordering recursively", () => {
    const left = canonicalRequestDigest({
      recipient: "reader@example.com",
      values: { second: 2, first: 1 },
    });
    const right = canonicalRequestDigest({
      values: { first: 1, second: 2 },
      recipient: "reader@example.com",
    });
    expect(left).toBe(right);
  });

  test("detects materially different requests", () => {
    const first = canonicalRequestDigest({ recipient: "first@example.com" });
    const second = canonicalRequestDigest({ recipient: "second@example.com" });
    expect(isMateriallyDifferent(first, second)).toBe(true);
    expect(isMateriallyDifferent(first, first)).toBe(false);
  });

  test("preserves replay behavior for pre-migration rows", () => {
    expect(isMateriallyDifferent(null, canonicalRequestDigest({ value: 1 }))).toBe(false);
  });
});
