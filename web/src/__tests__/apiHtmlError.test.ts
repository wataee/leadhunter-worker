import { describe, it, expect } from 'vitest';

// Test D4 HTML error detection logic
function parseApiResponse(text: string): any {
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new Error('API вернул HTML: проверьте _redirects/netlify.toml');
  }
  return JSON.parse(text);
}

describe('D4: HTML response error handling', () => {
  it('throws descriptive error when server returns HTML instead of JSON', () => {
    const htmlResponse = '<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div></body></html>';
    expect(() => parseApiResponse(htmlResponse)).toThrow('API вернул HTML: проверьте _redirects/netlify.toml');
  });

  it('correctly parses JSON responses', () => {
    const jsonResponse = '{"success":true,"items":[1,2,3]}';
    expect(parseApiResponse(jsonResponse)).toEqual({ success: true, items: [1, 2, 3] });
  });
});
