import { describe, expect, test } from "vitest";
import { diffMailerDefinition, templateDigest } from "./sync.js";

const timestamp = "2026-07-26T12:00:00.000Z";

describe("declarative synchronization", () => {
  test("produces stable alias-based operations without destructive changes", () => {
    const desired = {
      apiVersion: "simplemailer/v1" as const,
      senders: [
        {
          alias: "transactional",
          displayName: "SimpleMailer",
          fromAddress: "mail@example.com",
        },
      ],
      templates: [
        {
          name: "welcome",
          format: "HTML" as const,
          source: "<p>Hello</p>",
          subject: "Welcome",
          activate: true,
        },
      ],
    };
    const plan = diffMailerDefinition(desired, {
      senders: [],
      templates: [
        {
          name: "unused-remote-template",
          activeVersion: null,
          versions: [],
          updatedAt: timestamp,
        },
      ],
    });
    expect(plan.operations.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      "sender.upsert:transactional",
      "template.upsert:welcome",
    ]);
  });

  test("activates an existing identical version instead of creating one", () => {
    const template = {
      name: "welcome",
      format: "HTML" as const,
      source: "<p>Hello</p>",
      subject: "Welcome",
    };
    const digest = templateDigest(template);
    expect(digest).toBe(
      "8ee77f24ec3421433111c2526b95431198bdec9def4e2718e11d403725f714b8",
    );
    const plan = diffMailerDefinition(
      {
        apiVersion: "simplemailer/v1",
        senders: [],
        templates: [{ ...template, activate: true }],
      },
      {
        senders: [],
        templates: [
          {
            name: "welcome",
            activeVersion: null,
            updatedAt: timestamp,
            versions: [
              {
                version: "tplv_1",
                digest,
                format: "HTML",
                subject: "Welcome",
                createdAt: timestamp,
              },
            ],
          },
        ],
      },
    );
    expect(plan.operations).toEqual([
      { kind: "template.activate", name: "welcome", version: "tplv_1" },
    ]);
  });
});
