import { PitchTemplate, Lead, UserProfile } from '../types';
import { matchPortfolioDeepLink, PortfolioCategoryKey } from '../shared/portfolioMatcher.js';

export const DEFAULT_TEMPLATES: PitchTemplate[] = [
  {
    id: 'tpl_tg_direct',
    type: 'direct',
    title: 'Отклик в Telegram (короткий)',
    body: 'Привет! Увидел вакансию на монтаж. Специализируюсь на таком формате, вот портфолио: {ссылка_портфолио}. Могу сделать тестовый кусок на 30-40 секунд из ваших исходников сегодня. Актуально?',
  },
  {
    id: 'tpl_yt_retention',
    type: 'youtube',
    title: 'YouTube: динамика и саунд-дизайн',
    body: 'Привет! Насчет монтажа на YouTube. Монтирую динамично, с качественным саунд-дизайном, акцентами и удержанием зрителя без провисаний. Портфолио: {ссылка_портфолио}. Если исходники уже готовы, могу сегодня собрать короткий фрагмент для теста. Еще ищете монтажера?',
  },
  {
    id: 'tpl_reels_shorts',
    type: 'shorts',
    title: 'Reels и Shorts: хук и субтитры',
    body: 'Привет! По поводу вертикальных роликов (Reels/Shorts). Делаю упор на сильный хук в первые секунды, динамичные субтитры и перебивки под звук. Примеры: {ссылка_портфолио}. Готов собрать один тестовый ролик из вашего материала. Актуально?',
  },
  {
    id: 'tpl_podcast',
    type: 'podcast',
    title: 'Подкаст и разговорное видео',
    body: 'Привет! Откликаюсь на монтаж разговорного формата. Монтирую мультикам (2-4 камеры), вычищаю паузы и слова-паразиты, аккуратно свожу звук дорожек. Плюс могу сразу нарезать яркие моменты под рилсы. Портфолио: {ссылка_портфолио}. Обсудим детали?',
  },
  {
    id: 'tpl_test_offer',
    type: 'test',
    title: 'Предложение бесплатного теста (30-40 сек)',
    body: 'Привет! Видел ваш запрос на монтажера. Чтобы не тратить время на долгие обсуждения, предлагаю сделать короткий тестовый фрагмент на 30-40 секунд из ваших исходников бесплатно. Мое портфолио: {ссылка_портфолио}. Скинете тестовые материалы?',
  },
  {
    id: 'tpl_audit_suggestion',
    type: 'audit',
    title: 'Идея по монтажу и улучшению видео',
    body: 'Привет! Посмотрел ролик про {тема_ролика}. На {таймкод} есть момент, где темп немного проседает - можно сделать склейку плотнее и добавить перебивки, удержание зрителей будет заметно лучше. Могу наглядно показать на 20-секундном отрезке. Интересно глянуть?',
  },
  {
    id: 'tpl_sample_edit',
    type: 'audit',
    title: 'Готовый фрагмент перемонтажа',
    body: 'Привет! Перемонтировал небольшой фрагмент твоего видео про {тема_ролика} (подправил темп на {таймкод}): {ссылка_сэмпла}. Заценишь?',
  },
  {
    id: 'tpl_en_youtube',
    type: 'en_youtube',
    title: 'Quick Pitch: YouTube (EN)',
    body: 'Hey! Saw your post looking for a YouTube editor. I specialize in fast-paced editing, solid sound design, and keeping viewers hooked without filler. Here is my portfolio: {ссылка_портфолио}. Happy to cut a quick 45-sec test from your raw footage today. Are you still hiring?',
  },
  {
    id: 'tpl_en_shorts',
    type: 'en_shorts',
    title: 'Quick Pitch: Shorts & Reels (EN)',
    body: 'Hey! Reaching out regarding short-form video editing. I build high-retention Reels and Shorts with punchy hooks, clean captions, and engaging pacing. Samples: {ссылка_портфолио}. Would love to edit one free test video for you today. Let me know if you are open to it!',
  },
  {
    id: 'tpl_followup_soft',
    type: 'followup_1',
    title: 'Напоминание (через 2-3 дня)',
    body: 'Привет! На всякий случай напомню о себе, вдруг сообщение затерялось в потоке. Если уже закрыли вакансию - все в порядке, просто дай знать.',
  },
  {
    id: 'tpl_followup_final',
    type: 'followup_2',
    title: 'Финальное напоминание (закрытие диалога)',
    body: 'Привет! Если вопрос с поиском монтажера уже решен - не отвлекаю. Если в будущем снова понадобятся руки на монтаж - пиши, контакт сохраняется.',
  },
  {
    id: 'tpl_followup_en',
    type: 'followup_1',
    title: 'Follow-up (EN)',
    body: 'Hey! Just following up in case my message got buried. If you already found someone no worries at all - just let me know either way.',
  },
];

export interface QualityAnalysis {
  length: number;
  isTooLong: boolean;
  missingSpecifics: boolean;
  missingQuestion: boolean;
  hasBannedPhrases: boolean;
  genericPreview: boolean;
  previewLine: string;
}

/**
 * Extracts a client's personal Telegram handle from a vacancy post,
 * ignoring bots and the broadcast channel's own handle.
 */
export function extractDirectContactHandle(text: string, channelName?: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const selfClean = (channelName || '').toLowerCase().replace(/^@/, '').trim();

  const matches: string[] = [];
  const mentionRegex = /(?:^|[\s(,:])@([a-zA-Z][a-zA-Z0-9_]{3,31})\b/g;
  let m: RegExpExecArray | null;
  while ((m = mentionRegex.exec(text)) !== null) {
    matches.push(m[1]);
  }

  const tmeRegex = /(?:https?:\/\/)?t\.me\/([a-zA-Z][a-zA-Z0-9_]{3,31})(?:[/?#\s]|$)/gi;
  while ((m = tmeRegex.exec(text)) !== null) {
    const candidate = m[1];
    // Skip paths like t.me/s/..., t.me/joinchat, or channel's own post URLs
    if (!['s', 'c', 'joinchat', 'share'].includes(candidate.toLowerCase())) {
      matches.push(candidate);
    }
  }

  for (const raw of matches) {
    const lower = raw.toLowerCase();
    if (lower === selfClean) continue;
    if (lower.endsWith('bot')) continue;
    return raw;
  }

  return null;
}

export function substituteVariables(
  templateBody: string,
  lead: Partial<Lead> | null,
  profile: UserProfile,
  customFinding?: { timecode: string; note: string },
  context?: { text?: string; channel?: string; region?: string; lang?: string; portfolioCategory?: PortfolioCategoryKey }
): string {
  let result = templateBody;

  const isEn = !/[а-яё]/i.test(templateBody);
  const leadName = lead?.name || (isEn ? 'there' : 'коллега');
  const channelName = lead?.name || (isEn ? 'your YouTube channel' : 'YouTube канал');
  const topic = lead?.lastVideo?.title || (isEn ? 'your recent video' : 'твоем последнем видео');

  const timecode = customFinding?.timecode || lead?.findings?.[0]?.timecode || '01:20';
  const problem =
    customFinding?.note ||
    lead?.findings?.[0]?.note ||
    (isEn ? 'pacing slows down slightly' : 'затянутый переход');

  const portfolioMatch = matchPortfolioDeepLink({
    text: `${context?.text || ''} ${lead?.notes || ''} ${lead?.niche || ''} ${topic}`,
    channelOrNiche: context?.channel || lead?.niche || '',
    region: context?.region || lead?.region || (isEn ? 'US' : 'KZ'),
    lang: context?.lang || (isEn ? 'en' : 'ru'),
    basePortfolioUrl: profile.portfolioUrl || 'https://fleur-editor.netlify.app',
    overrideCategory: context?.portfolioCategory || 'auto',
  });

  const sampleUrl = profile.sampleUrl || portfolioMatch.sampleUrl || 'https://youtu.be/cZZgi5xn930';
  const portfolioUrl = portfolioMatch.url;

  result = result
    .replace(/{имя}/g, leadName)
    .replace(/{канал}/g, channelName)
    .replace(/{тема_ролика}/g, topic)
    .replace(/{таймкод}/g, timecode)
    .replace(/{проблема}/g, problem)
    .replace(/{ссылка_портфолио}/g, portfolioUrl)
    .replace(/{ссылка_сэмпла}/g, sampleUrl)
    .replace(/{моё_имя}/g, profile.name || 'Timur')
    .replace(/{моя_специализация}/g, profile.specialization || 'YouTube & Reels editing');

  return result;
}

export function analyzePitchQuality(text: string): QualityAnalysis {
  const trimmed = text.trim();
  const length = trimmed.length;
  const isTooLong = length > 450;

  // Specifics check: timecode, duration, channel, or tangible metric/action
  const hasTimecode = /\d{1,2}:\d{2}/.test(trimmed);
  const hasSpecifics =
    hasTimecode ||
    /(секунд|сек|минут|мин|ролик|канал|фрагмент|таймкод|sec\b|min\b|second|minute|video|channel|intro|cut|sample|hook|retention)/i.test(
      trimmed
    );

  // Question check: question mark within the last 60 characters
  const endSlice = trimmed.slice(-60);
  const missingQuestion = !endSlice.includes('?');

  // Banned cliché phrases (RU + EN)
  const hasBannedPhrases =
    /услуг[иае]\s+монтажа|video\s+editing\s+services|offering\s+my\s+editing\s+services/i.test(
      trimmed
    );

  // Preview line: first 60 chars
  const previewLine = trimmed.slice(0, 60);
  const lowerPreview = previewLine.toLowerCase();
  const genericPreview =
    lowerPreview.startsWith('привет, мне очень нравится') ||
    lowerPreview.startsWith('здравствуйте, меня зовут') ||
    lowerPreview.startsWith('добрый день, меня зовут') ||
    lowerPreview.startsWith('hi, i really love') ||
    lowerPreview.startsWith('hello, my name is') ||
    lowerPreview.startsWith('to whom it may concern');

  return {
    length,
    isTooLong,
    missingSpecifics: !hasSpecifics,
    missingQuestion,
    hasBannedPhrases,
    genericPreview,
    previewLine,
  };
}
