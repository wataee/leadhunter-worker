import { fetchWithTimeout } from './response';

export interface AiCompletionResult {
  text: string;
  provider: 'gemini' | 'groq' | 'openrouter' | 'anthropic';
  model: string;
}

/**
 * Sanitize user input by removing non-printable/control characters and enforcing max length
 */
export function sanitizeInput(text: string, maxLength = 4000): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

// Default models
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const OPENROUTER_DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const ANTHROPIC_DEFAULT_MODEL = 'claude-3-5-haiku-20241022';

/**
 * Call Google Gemini API using header-based authentication
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  modelName: string
): Promise<string> {
  const model = modelName || GEMINI_DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
    },
    15000
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error (HTTP ${res.status}): ${errorText.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API вернул пустой ответ');
  }

  return text;
}

/**
 * Call Groq API (OpenAI-compatible)
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  modelName: string
): Promise<string> {
  const model = modelName || GROQ_DEFAULT_MODEL;
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    },
    15000
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API error (HTTP ${res.status}): ${errorText.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq API вернул пустой ответ');
  }

  return text;
}

/**
 * Call OpenRouter API (OpenAI-compatible)
 */
async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  modelName: string
): Promise<string> {
  const model = modelName || OPENROUTER_DEFAULT_MODEL;
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://fleurleads-work.netlify.app',
        'X-Title': 'LeadHunter',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    },
    15000
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenRouter API error (HTTP ${res.status}): ${errorText.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenRouter API вернул пустой ответ');
  }

  return text;
}

/**
 * Call Anthropic Claude Messages API
 */
async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  modelName: string
): Promise<string> {
  const model = modelName || ANTHROPIC_DEFAULT_MODEL;
  const url = 'https://api.anthropic.com/v1/messages';

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 2048,
        temperature: 0.2,
      }),
    },
    15000
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API error (HTTP ${res.status}): ${errorText.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Anthropic API вернул пустой ответ');
  }

  return text;
}

/**
 * Primary AI Completion function with fallback chain:
 * Gemini → Groq → OpenRouter → Anthropic
 */
export async function generateAiCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<AiCompletionResult> {
  const cleanSystem = sanitizeInput(systemPrompt, 3000);
  const cleanUser = sanitizeInput(userPrompt, 8000);

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  const attempts: string[] = [];

  // 1. Gemini
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
    try {
      const text = await callGemini(cleanSystem, cleanUser, geminiKey, model);
      return { text, provider: 'gemini', model };
    } catch (err: any) {
      console.warn(`[AI Chain] Gemini (${model}) failed:`, err.message);
      attempts.push(`Gemini: ${err.message}`);
    }
  }

  // 2. Groq
  if (groqKey) {
    const model = process.env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL;
    try {
      const text = await callGroq(cleanSystem, cleanUser, groqKey, model);
      return { text, provider: 'groq', model };
    } catch (err: any) {
      console.warn(`[AI Chain] Groq (${model}) failed:`, err.message);
      attempts.push(`Groq: ${err.message}`);
    }
  }

  // 3. OpenRouter
  if (openRouterKey) {
    const model = process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL;
    try {
      const text = await callOpenRouter(cleanSystem, cleanUser, openRouterKey, model);
      return { text, provider: 'openrouter', model };
    } catch (err: any) {
      console.warn(`[AI Chain] OpenRouter (${model}) failed:`, err.message);
      attempts.push(`OpenRouter: ${err.message}`);
    }
  }

  // 4. Anthropic
  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL;
    try {
      const text = await callAnthropic(cleanSystem, cleanUser, anthropicKey, model);
      return { text, provider: 'anthropic', model };
    } catch (err: any) {
      console.warn(`[AI Chain] Anthropic (${model}) failed:`, err.message);
      attempts.push(`Anthropic: ${err.message}`);
    }
  }

  if (attempts.length === 0) {
    throw new Error(
      'Ни один AI-провайдер не настроен. Задайте GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY или ANTHROPIC_API_KEY в переменных окружения.'
    );
  }

  throw new Error(`Все AI-провайдеры завершились с ошибкой: ${attempts.join('; ')}`);
}
