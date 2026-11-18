import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkDistributedRateLimit,
  validatePayloadSize,
  type NetlifyResponse,
} from './_shared/response';
import { generateAiCompletion, sanitizeInput, wrapUserData, PROMPT_INJECTION_DEFENSE } from './_shared/ai';
import { requireAuth } from './_shared/auth';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
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
  "Ты оцениваешь YouTube-каналы как потенциальных клиентов для фриланс-видеомонтажёра, который монтирует длинные ролики и подкасты. Платёжеспособный клиент: автор с реальным бизнесом (курсы, консалтинг, SaaS, услуги, b2b), регулярно выпускающий видео, с аудиторией 5-50 тысяч. Развлекательные каналы без продукта оценивай низко. Оценивай ТОЛЬКО по предоставленным данным, ничего не выдумывай, качество монтажа по тексту определить нельзя, не утверждай о нём. " +
  PROMPT_INJECTION_DEFENSE +
  " Верни JSON-массив объектов: {channelId, is_business:boolean, monetization:'product'|'ads_only'|'unclear', fit_score:0-100, has_editor_signals:boolean, awareness:'unaware'|'problem'|'solution'|'product', pain_hypotheses:string[] (до 3, формулируй как гипотезы), reason:string (одно предложение), opening_angle:string (идея первой строки сообщения, конкретная и без лести)}.";

function buildUserPrompt(leads: LeadInput[], examples?: ScoreRequestBody['examples']): string {
  let prompt = '';

  if (examples) {
    if (examples.good && examples.good.length > 0) {
      prompt += 'Примеры лидов, которые ответили (целевые):\n';
      examples.good.slice(0, 3).forEach((ex, i) => {
        prompt += `${i + 1}. Название: "${sanitizeInput(ex.title, 100)}", Ниша: "${sanitizeInput(ex.niche || '—', 50)}", Сабов: ${ex.subscribers}, Описание: "${sanitizeInput(ex.description || '', 150)}"\n`;
      });
      prompt += '\n';
    }
    if (examples.bad && examples.bad.length > 0) {
      prompt += 'Примеры лидов, которые не подошли (нецелевые / без ответа):\n';
      examples.bad.slice(0, 3).forEach((ex, i) => {
        prompt += `${i + 1}. Название: "${sanitizeInput(ex.title, 100)}", Ниша: "${sanitizeInput(ex.niche || '—', 50)}", Сабов: ${ex.subscribers}, Описание: "${sanitizeInput(ex.description || '', 150)}"\n`;
      });
      prompt += '\n';
    }
  }

  prompt += 'Оцени следующие YouTube-каналы (верни строго JSON-массив объектов):\n';
  leads.forEach((l, idx) => {
    const rawData = [
      `channelId: "${l.channelId}"`,
      `Название: "${sanitizeInput(l.title, 150)}"`,
      `Подписчики: ${l.subscribers}`,
      `Частота: ~${l.uploadsPerMonth || 1} видео/мес`,
      `Есть ключевые слова продукта: ${l.hasProductKeywords ? 'Да' : 'Нет'}`,
      `Ссылки: ${(l.links || []).map((link) => sanitizeInput(link, 150)).join(', ') || 'нет'}`,
      `Описание канала: "${sanitizeInput(l.description || '', 350)}"`,
      l.lastVideos && l.lastVideos.length > 0
        ? 'Последние видео:\n' +
          l.lastVideos
            .slice(0, 3)
            .map((v, vIdx) => `  ${vIdx + 1}) "${sanitizeInput(v.title, 150)}" (${v.publishedAt ? v.publishedAt.slice(0, 10) : ''}) — ${sanitizeInput(v.description || '', 150)}`)
            .join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    prompt += `--- КАНАЛ ${idx + 1} ---\n${wrapUserData(rawData, `CHANNEL_${idx + 1}`)}\n\n`;
  });

  return prompt;
}

function parseAndValidateResults(rawText: string, leads: LeadInput[]): AiLeadResult[] {
  let clean = rawText.trim();
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
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

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // 1.3 Проверка авторизации
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.', null, origin);
  }

  // Rate Limiting по IP (распределённый через Upstash Redis или in-memory)
  const clientIp =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = await checkDistributedRateLimit(clientIp, 30, 60_000);
  if (!rateCheck.allowed) {
    return errorResponse(429, 'Слишком много запросов к AI. Пожалуйста, подождите минуту.', null, origin);
  }

  // Проверка размера тела запроса (макс 32 КБ)
  const sizeValidation = validatePayloadSize(event.body, 32 * 1024);
  if (!sizeValidation.valid) {
    return errorResponse(400, sizeValidation.error || 'Слишком большой запрос', null, origin);
  }

  let body: ScoreRequestBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON в теле запроса.', null, origin);
  }

  const customKey = (
    event.headers?.['x-custom-ai-key'] ||
    (event.headers as any)?.['X-Custom-Ai-Key'] ||
    (body as any)?.customApiKey ||
    ''
  ).trim();

  const customProvider = (
    event.headers?.['x-custom-ai-provider'] ||
    (event.headers as any)?.['X-Custom-Ai-Provider'] ||
    (body as any)?.customProvider ||
    ''
  ).trim();

  const hasAiKey = Boolean(
    customKey ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GROQ_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim()
  );

  if (!hasAiKey) {
    return jsonResponse(200, { enabled: false }, origin);
  }

  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 5) : [];
  if (leads.length === 0) {
    return errorResponse(400, 'Список leads пуст или не передан.', null, origin);
  }

  const userPrompt = buildUserPrompt(leads, body.examples);

  let completionResult;
  try {
    completionResult = await generateAiCompletion(
      SYSTEM_PROMPT,
      userPrompt,
      customKey ? { apiKey: customKey, provider: customProvider } : undefined
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Все настроенные AI-провайдеры вернули ошибку.';
    return errorResponse(502, msg, null, origin);
  }

  let results: AiLeadResult[];
  try {
    results = parseAndValidateResults(completionResult.text, leads);
  } catch {
    try {
      const fixed = completionResult.text.replace(/,\s*([\]}])/g, '$1');
      results = parseAndValidateResults(fixed, leads);
    } catch {
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

  return jsonResponse(
    200,
    {
      enabled: true,
      provider: completionResult.provider,
      model: completionResult.model,
      scores: results,
    },
    origin
  );
}
