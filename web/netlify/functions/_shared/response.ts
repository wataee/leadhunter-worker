export interface NetlifyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export function jsonResponse(statusCode: number, data: unknown): NetlifyResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(data),
  };
}

export function errorResponse(statusCode: number, message: string, details?: unknown): NetlifyResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({
      error: message,
      details: details ?? null,
    }),
  };
}

export function handleOptions(): NetlifyResponse {
  return {
    statusCode: 204,
    headers: corsHeaders,
    body: '',
  };
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}
