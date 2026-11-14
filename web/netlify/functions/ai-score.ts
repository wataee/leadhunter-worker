import {
  jsonResponse,
  errorResponse,
  handleOptions,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
  body: string | null;
}

interface LeadInput {
  channelId: string;
  title: string;
  description: string;
  subscribers: number;
  uploadsPerMonth?: number;
  lastVideos?: Array<{
    title: string;
    description: string;
    publishedAt: string;
  }>;
  links?: string[];
  hasProductKeywords?: boolean;
}

interface ExampleLead {
  title: string;
  description: string;
  subscribers: number;
  niche?: string;
}

interface ScoreRequestBody {
  leads: LeadInput[];
  examples?: {
    good?: ExampleLead[];
    bad?: ExampleLead[];
  };
}

export interface AiLeadResult {
  channelId: string;
  is_business: boolean;
  monetization: 'product' | 'ads_only' | 'unclear';
  fit_score: number;
  has_editor_signals: boolean;
  awareness: 'unaware' | 'problem' | 'solution' | 'product';
  pain_hypotheses: string[];
  reason: string;
  opening_angle: string;
  error?: string;
}

const SYSTEM_PROMPT =
  "Ты оцениваешь YouTube-каналы как потенциальных клиентов для фриланс-видеомонтажёра, который монтирует длинные ролики и подкасты. Платёжеспособный клиент: автор с реальным бизнесом (курсы, консалтинг, SaaS, услуги, b2b), регулярно выпускающий видео, с аудиторией 5-50 тысяч. Развлекательные каналы без продукта оценивай низко. Оценивай ТОЛЬКО по предоставленным данным, ничего не выдумывай, качество монтажа по тексту определить нельзя, не утверждай о нём. Верни JSON-массив объектов: {channelId, is_business:boolean, monetization:'product'|'ads_only'|'unclear', fit_score:0-100, has_editor_signals:boolean, awareness:'unaware'|'problem'|'solution'|'product', pain_hypotheses:string[] (до 3, формулируй как гипотезы), reason:string (одно предложение), opening_angle:string (идея первой строки сообщения, конкретная и без лести)}.";

function buildUserPrompt(leads: LeadInput[], examples?: ScoreRequestBody['examples']): string {
  let prompt = '';

  if (examples) {
    if (examples.good && examples.good.length > 0) {
      prompt += 'Примеры лидов, которые ответили (целевые):\n';
      examples.good.slice(0, 3).forEach((ex, i) => {
        prompt += `${i + 1}. Название: "${ex.title}", Ниша: "${ex.niche || '—'}", Сабов: ${ex.subscribers}, Описание: "${(ex.description || '').slice(0, 150)}"\n`;
      });
      prompt += '\n';
    }
    if (examples.bad && examples.bad.length > 0) {
      prompt += 'Примеры лидов, которые не подошли (нецелевые / без ответа):\n';
      examples.bad.slice(0, 3).forEach((ex, i) => {
        prompt += `${i + 1}. Название: "${ex.title}", Ниша: "${ex.niche || '—'}", Сабов: ${ex.subscribers}, Описание: "${(ex.description || '').slice(0, 150)}"\n`;
      });
      prompt += '\n';
    }
  }

  prompt += 'Оцени следующие YouTube-каналы (верни строго JSON-массив объектов):\n';
  leads.forEach((l, idx) => {
    prompt += `--- КАНАЛ ${idx + 1} ---\n`;
    prompt += `channelId: "${l.channelId}"\n`;
    prompt += `Название: "${l.title}"\n`;
    prompt += `Подписчики: ${l.subscribers}\n`;
    prompt += `Частота: ~${l.uploadsPerMonth || 1} видео/мес\n`;
    prompt += `Есть ключевые слова продукта: ${l.hasProductKeywords ? 'Да' : 'Нет'}\n`;
    prompt += `Ссылки: ${(l.links || []).join(', ') || 'нет'}\n`;
    prompt += `Описание канала: "${(l.description || '').slice(0, 350)}"\n`;
    if (l.lastVideos && l.lastVideos.length > 0) {
      prompt += 'Последние видео:\n';
      l.lastVideos.slice(0, 3).forEach((v, vIdx) => {
        prompt += `  ${vIdx + 1}) "${v.title}" (${v.publishedAt ? v.publishedAt.slice(0, 10) : ''}) — ${(v.description || '').slice(0, 150)}\n`;
      });
    }
    prompt += '\n';
  });

  return prompt;
}

function parseAndValidateResults(rawText: string, leads: LeadInput[]): AiLeadResult[] {
  let clean = rawText.trim();

  // Strip markdown code fences if model enclosed in ```json ... ```
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // If wrapped in an object like { "leads": [...] } or { "scores": [...] }
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Try to extract bracketed array [ ... ]
    const arrayMatch = clean.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
      parsed = JSON.parse(arrayMatch[0]);
    } else {
      throw new Error('Не удалось извлечь JSON-массив из ответа модели');
    }
  }

  let items: unknown[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const values = Object.values(parsed as Record<string, unknown>);
    const firstArray = values.find((v) => Array.isArray(v));
    if (firstArray) items = firstArray;
  }

  const results: AiLeadResult[] = [];

  for (const lead of leads) {
    const found = items.find(
      (it) => it && typeof it === 'object' && (it as Record<string, unknown>).channelId === lead.channelId
    ) as Record<string, unknown> | undefined;

    if (!found) {
      // Fallback matching by index if model omitted channelId
      const fallbackItem = items[results.length] as Record<string, unknown> | undefined;
      if (fallbackItem) {
        results.push(normalizeItem(lead.channelId, fallbackItem));
      } else {
        results.push({
          channelId: lead.channelId,
          is_business: lead.hasProductKeywords || false,
          monetization: lead.hasProductKeywords ? 'product' : 'unclear',
          fit_score: 50,
          has_editor_signals: false,
          awareness: 'problem',
          pain_hypotheses: ['Потенциал роста удержания на видео'],
          reason: 'Оценка по умолчанию из-за неполного ответа модели',
          opening_angle: `Вопрос по вашему ролику "${lead.lastVideos?.[0]?.title || lead.title}"`,
          error: 'Модель не вернула оценку для данного канала',
        });
      }
    } else {
      results.push(normalizeItem(lead.channelId, found));
    }
  }

  return results;
}

function normalizeItem(channelId: string, obj: Record<string, unknown>): AiLeadResult {
  const is_business = Boolean(obj.is_business);
  const monetization = ['product', 'ads_only', 'unclear'].includes(String(obj.monetization))
    ? (obj.monetization as 'product' | 'ads_only' | 'unclear')
    : 'unclear';

  let fit_score = typeof obj.fit_score === 'number' ? obj.fit_score : parseInt(String(obj.fit_score || '50'), 10);
  if (isNaN(fit_score)) fit_score = 50;
  fit_score = Math.max(0, Math.min(100, Math.round(fit_score)));

  const has_editor_signals = Boolean(obj.has_editor_signals);
  const awareness = ['unaware', 'problem', 'solution', 'product'].includes(String(obj.awareness))
    ? (obj.awareness as 'unaware' | 'problem' | 'solution' | 'product')
    : 'problem';

  let pain_hypotheses: string[] = [];
  if (Array.isArray(obj.pain_hypotheses)) {
    pain_hypotheses = obj.pain_hypotheses.map(String).slice(0, 3);
  }

  const reason = String(obj.reason || 'Анализ завершён').slice(0, 200);
  const opening_angle = String(obj.opening_angle || 'Вопрос по вашему ролику').slice(0, 250);

  return {
    channelId,
    is_business,
    monetization,
    fit_score,
    has_editor_signals,
    awareness,
    pain_hypotheses,
    reason,
    opening_angle,
  };
}

/* Call Gemini API with internal model resilience */
async function callGemini(
  apiKey: string,
  modelName: string,
  userPrompt: string
): Promise<string> {
  const modelsToTry = [
    modelName,
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.8-flash',
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastStatus = 0;

  for (const mod of modelsToTry) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent?key=${apiKey}`;
    try {
      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2000,
              responseMimeType: 'application/json',
            },
          }),
        },
        15000
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
      lastStatus = res.status;
    } catch {
      // Continue to next model in list
    }
  }

  throw new Error(`Gemini HTTP ${lastStatus || 500}`);
}

/* Call Groq API */
async function callGroq(
  apiKey: string,
  modelName: string,
  userPrompt: string
): Promise<string> {
  const res = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    },
    15000
  );

  if (!res.ok) {
    throw new Error(`Groq HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Пустой ответ от Groq');
  return text;
}

/* Call OpenRouter API */
async function callOpenRouter(
  apiKey: string,
  modelName: string,
  userPrompt: string
): Promise<string> {
  const res = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fleurleads-work.netlify.app',
        'X-Title': 'LeadHunter',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    },
    15000
  );

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Пустой ответ от OpenRouter');
  return text;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.');
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();

  // If no keys configured, return { enabled: false } without error!
  if (!geminiKey && !groqKey && !openRouterKey) {
    return jsonResponse(200, { enabled: false });
  }

  let body: ScoreRequestBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON в теле запроса.');
  }

  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 5) : [];
  if (leads.length === 0) {
    return errorResponse(400, 'Список leads пуст или не передан.');
  }

  const userPrompt = buildUserPrompt(leads, body.examples);

  // Chain: 1) Gemini -> 2) Groq -> 3) OpenRouter
  const chain: Array<{
    name: string;
    fn: () => Promise<string>;
  }> = [];

  if (geminiKey) {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
    chain.push({
      name: 'gemini',
      fn: () => callGemini(geminiKey, model, userPrompt),
    });
  }

  if (groqKey) {
    const model = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
    chain.push({
      name: 'groq',
      fn: () => callGroq(groqKey, model, userPrompt),
    });
  }

  if (openRouterKey) {
    const model = process.env.OPENROUTER_MODEL?.trim() || 'meta-llama/llama-3.3-70b-instruct:free';
    chain.push({
      name: 'openrouter',
      fn: () => callOpenRouter(openRouterKey, model, userPrompt),
    });
  }

  let lastError: unknown = null;
  let successfulProvider = '';
  let rawResponseText = '';

  for (const provider of chain) {
    try {
      rawResponseText = await provider.fn();
      successfulProvider = provider.name;
      break;
    } catch (err: unknown) {
      lastError = err;
      // Continue to next provider in fallback chain
    }
  }

  if (!rawResponseText) {
    return errorResponse(
      502,
      `Все настроенные AI-провайдеры вернули ошибку или исчерпали лимит. Последняя ошибка: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  // Safe parsing with 1 retry attempt if JSON is slightly malformed
  let results: AiLeadResult[];
  try {
    results = parseAndValidateResults(rawResponseText, leads);
  } catch {
    // 1 retry attempt with cleanup
    try {
      const fixed = rawResponseText.replace(/,\s*([\]}])/g, '$1');
      results = parseAndValidateResults(fixed, leads);
    } catch {
      // If parsing failed completely, return baseline scores with error note per lead
      results = leads.map((l) => ({
        channelId: l.channelId,
        is_business: l.hasProductKeywords || false,
        monetization: l.hasProductKeywords ? 'product' : 'unclear',
        fit_score: 50,
        has_editor_signals: false,
        awareness: 'problem',
        pain_hypotheses: ['Потенциал роста удержания на видео'],
        reason: 'Ошибка парсинга ответа модели',
        opening_angle: `Вопрос по вашему ролику "${l.lastVideos?.[0]?.title || l.title}"`,
        error: 'Ответ модели не удалось разобрать как валидный JSON',
      }));
    }
  }

  return jsonResponse(200, {
    enabled: true,
    provider: successfulProvider,
    scores: results,
  });
}
