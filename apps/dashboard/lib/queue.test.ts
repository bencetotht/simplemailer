import { afterEach, describe, expect, test, vi } from "vitest";

const originalRabbitUrl = process.env.RABBITMQ_URL;
const originalRabbitVhost = process.env.RABBITMQ_VHOST;
const originalRabbitApiUser = process.env.RABBITMQ_API_USER;
const originalRabbitApiPass = process.env.RABBITMQ_API_PASS;

afterEach(() => {
  if (originalRabbitUrl === undefined) delete process.env.RABBITMQ_URL;
  else process.env.RABBITMQ_URL = originalRabbitUrl;
  if (originalRabbitVhost === undefined) delete process.env.RABBITMQ_VHOST;
  else process.env.RABBITMQ_VHOST = originalRabbitVhost;
  if (originalRabbitApiUser === undefined) delete process.env.RABBITMQ_API_USER;
  else process.env.RABBITMQ_API_USER = originalRabbitApiUser;
  if (originalRabbitApiPass === undefined) delete process.env.RABBITMQ_API_PASS;
  else process.env.RABBITMQ_API_PASS = originalRabbitApiPass;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("RabbitMQ management API", () => {
  test("uses the virtual host from the AMQP URL", async () => {
    process.env.RABBITMQ_URL = "amqp://user:pass@rabbit:5672/simplemailer";
    process.env.RABBITMQ_API_USER = "api-user";
    process.env.RABBITMQ_API_PASS = "api-pass";
    delete process.env.RABBITMQ_VHOST;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getQueueMessages } = await import("./queue");
    await expect(getQueueMessages("mailer")).resolves.toEqual([]);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:15672/api/queues/simplemailer/mailer/get",
    );
  });
});
