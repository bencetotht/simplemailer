import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { signWebhookBody, webhookRetryDelayMs } from './webhooks';

describe('webhook delivery protocol', () => {
  test('signs the timestamp and exact raw body with HMAC SHA-256', () => {
    const body = '{"id":"evt_1","type":"message.sent"}';
    const expected = createHmac('sha256', 'whsec_test')
      .update(`1722000000.${body}`)
      .digest('hex');

    expect(signWebhookBody('whsec_test', 1_722_000_000, body)).toBe(expected);
    expect(signWebhookBody('whsec_test', 1_722_000_000, `${body}\n`)).not.toBe(expected);
  });

  test('uses capped exponential backoff with bounded jitter', () => {
    expect(webhookRetryDelayMs(1, () => 0)).toBe(24_000);
    expect(webhookRetryDelayMs(2, () => 0.5)).toBe(60_000);
    expect(webhookRetryDelayMs(20, () => 1)).toBe(4_320_000);
  });
});
