import { afterEach, describe, expect, test, vi } from "vitest";
import { normalizeWebhookUrl } from "./webhooks";

describe("webhook URL policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("requires HTTPS and rejects private targets in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(normalizeWebhookUrl("https://hooks.example.com/simplemailer")).toBe(
      "https://hooks.example.com/simplemailer",
    );
    expect(() => normalizeWebhookUrl("http://hooks.example.com")).toThrow("HTTPS");
    expect(() => normalizeWebhookUrl("https://127.0.0.1/hook")).toThrow("private");
    expect(() => normalizeWebhookUrl("https://metadata.internal/hook")).toThrow("private");
  });

  test("allows an explicit localhost HTTP receiver only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(normalizeWebhookUrl("http://localhost:4000/hook")).toBe(
      "http://localhost:4000/hook",
    );
  });

  test("rejects URL credentials and fragments", () => {
    expect(() => normalizeWebhookUrl("https://user:pass@hooks.example.com")).toThrow(
      "credentials",
    );
    expect(() => normalizeWebhookUrl("https://hooks.example.com/#secret")).toThrow(
      "fragments",
    );
  });
});
