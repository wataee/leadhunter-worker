import { describe, it, expect } from 'vitest';
import { handler } from '../../netlify/functions/tg-callback';

describe('5.2 tg-callback', () => {
  it('rejects requests without valid secret token', async () => {
    process.env.WEBHOOK_SECRET = 'super-secret-token-1234567890';
    process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';

    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-token' },
      body: JSON.stringify({ update_id: 1 }),
    });

    expect(res.statusCode).toBe(401);
  });

  it('acknowledges non-callback updates with 200', async () => {
    process.env.WEBHOOK_SECRET = 'super-secret-token-1234567890';
    process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';

    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'super-secret-token-1234567890' },
      body: JSON.stringify({ update_id: 1, message: { text: 'hello' } }),
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.handled).toBe('non_callback');
  });
});
