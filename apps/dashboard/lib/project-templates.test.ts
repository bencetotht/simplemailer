import { describe, expect, test } from "vitest";
import { managedTemplateDigest } from "./project-templates";

describe("managed template versions", () => {
  test("uses the public synchronization digest for immutable version deduplication", () => {
    expect(managedTemplateDigest({
      name: "welcome",
      format: "HTML",
      source: "<p>Hello</p>",
      subject: "Welcome",
    })).toBe("8ee77f24ec3421433111c2526b95431198bdec9def4e2718e11d403725f714b8");
  });
});
