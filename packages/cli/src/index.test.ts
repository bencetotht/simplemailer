import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadManifest, redactPlan } from "./index.js";

describe("manifest CLI core", () => {
  test("loads equivalent YAML and resolves template sources relative to the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "simplemailer-cli-"));
    await writeFile(join(directory, "welcome.html"), "<p>Welcome</p>");
    await writeFile(
      join(directory, "simplemailer.yaml"),
      [
        "apiVersion: simplemailer/v1",
        "senders:",
        "  - alias: transactional",
        "    displayName: Example",
        "    fromAddress: mail@example.com",
        "templates:",
        "  - name: welcome",
        "    format: HTML",
        "    source:",
        "      path: welcome.html",
        "    activate: true",
      ].join("\n"),
    );
    const loaded = await loadManifest(join(directory, "simplemailer.yaml"));
    expect(loaded.resolved.templates[0]).toMatchObject({
      name: "welcome",
      source: "<p>Welcome</p>",
      activate: true,
    });
  });

  test("redacts credential material in machine-readable plans", () => {
    const redacted = redactPlan({
      unchanged: { senders: [], templates: [] },
      operations: [
        {
          kind: "sender.upsert",
          name: "transactional",
          desired: {
            alias: "transactional",
            displayName: "Example",
            fromAddress: "mail@example.com",
            credential: { env: "SMTP_PASSWORD" },
          },
        },
      ],
    });
    expect(JSON.stringify(redacted)).not.toContain("secret");
    expect(redacted).toMatchObject({
      operations: [
        {
          desired: {
            credential: { env: "SMTP_PASSWORD", value: "[REDACTED]" },
          },
        },
      ],
    });
  });
});
