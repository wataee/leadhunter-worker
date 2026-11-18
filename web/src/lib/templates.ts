import { PitchTemplate, Lead, UserProfile } from '../types';

export const DEFAULT_TEMPLATES: PitchTemplate[] = [
  {
    id: 'tpl_shotgun',
    type: 'shotgun',
    title: 'Отклик на вакансию (RU / KZ)',
    body: 'Привет, {имя}! Увидел вашу вакансию на монтаж. Делаю именно такой формат, вот работы: {ссылка_портфолио}. Готов сделать тестовый фрагмент прямо сейчас. Вы ещё ищете?',
  },
  {
    id: 'tpl_shotgun_en',
    type: 'shotgun',
    title: 'Quick Reply (EU / US English)',
    body: 'Hey {имя} — saw your post looking for an editor. I specialize in this exact format, here is my portfolio: {ссылка_портфолио}. Happy to cut a quick 30-sec sample from your footage today. Are you still hiring?',
  },
  {
    id: 'tpl_youtube_dynamic',
    type: 'youtube_dynamic',
    title: 'YouTube: Удержание и динамика (RU)',
    body: 'Привет, {имя}! Увидел вакансию на монтаж YouTube-выпуска. Специализируюсь на динамичном монтаже с удержанием аудитории (саунд-дизайн, хуки, вырезка пауз, плотный ритм без воды). Моё портфолио: {ссылка_портфолио}. Могу смонтировать тестовый 1-минутный фрагмент из ваших исходников сегодня. Вы ещё рассматриваете кандидатов?',
  },
  {
    id: 'tpl_reels_viral',
    type: 'reels_viral',
    title: 'Reels / Shorts: Хуки и субтитры (RU)',
    body: 'Привет! По поводу монтажа коротких вертикальных видео. Делаю Reels/Shorts с сильным хуком в первые 3 секунды, динамичными субтитрами, звуковыми акцентами и B-roll подложками. Портфолио рилс: {ссылка_портфолио}. Могу смонтировать один тестовый ролик из вашего материала, чтобы вы оценили подачу. Актуально?',
  },
  {
    id: 'tpl_podcast_clean',
    type: 'podcast_clean',
    title: 'Подкаст: Чистый звук и мультикам',
    body: 'Здравствуйте, {имя}! Откликаюсь на монтаж подкаста/интервью. Опыт работы с мультикамерной съемкой (2-4 ракурса), выравниванием звука дорожек и нарезкой цепляющих тизеров/шортсов для продвижения. Примеры смонтированных выпусков: {ссылка_портфолио}. Готовы обсудить детали и объем исходников?',
  },
  {
    id: 'tpl_sniper',
    type: 'sniper',
    title: 'Снайпер: вопрос по таймкоду (RU)',
    body: 'Вопрос по твоему видео про {тема_ролика}: на {таймкод} {проблема}. Есть идея, как это исправить и поднять удержание. Не против, если покажу?',
  },
  {
    id: 'tpl_sniper_en',
    type: 'sniper',
    title: 'Sniper: Timecode Audit (EN)',
    body: 'Quick question on your video about {тема_ролика}: around {таймкод}, {проблема}. I have an idea to tighten the pacing there — mind if I send a 30-sec suggestion?',
  },
  {
    id: 'tpl_fire_question',
    type: 'fire_question',
    title: 'Огнемёт: идея по ролику (RU)',
    body: 'Привет, {имя}! Обратил внимание на канал {канал}. В ролике про {тема_ролика} на {таймкод} {проблема}. Собрал идею, как перестроить этот блок и поднять удержание на 15-20%. Показать набросок?',
  },
  {
    id: 'tpl_fire_sample',
    type: 'fire_sample',
    title: 'Огнемёт: готовый ре-эдит (RU)',
    body: '{имя}, привет! Перемонтировал динамичный фрагмент твоего видео про {тема_ролика} (исправил {проблема} на {таймкод}): {ссылка_сэмпла}. Заценишь?',
  },
  {
    id: 'tpl_fire_sample_en',
    type: 'fire_sample',
    title: 'Flamethrower: Re-edit Sample (EN)',
    body: 'Hey {имя} — I recut a punchier 45-sec version of your "{тема_ролика}" intro ({таймкод}): {ссылка_сэмпла}. Portfolio: {ссылка_портфолио}. Open to taking a quick look?',
  },
  {
    id: 'tpl_followup_1',
    type: 'followup_1',
    title: 'Follow-up 1 (RU)',
    body: 'Привет, просто поднимаю сообщение выше, возможно, потерялось. Если решили двигаться в другом направлении — без проблем, просто дай знать.',
  },
  {
    id: 'tpl_followup_1_en',
    type: 'followup_1',
    title: 'Follow-up 1 (EN)',
    body: 'Hey {имя}, just bumping this up in case it got buried. If you went another direction no worries at all — let me know either way?',
  },
  {
    id: 'tpl_followup_2',
    type: 'followup_2',
    title: 'Follow-up 2 финальный (RU)',
    body: 'Привет, {имя}! Похоже, сейчас вопрос с видеомонтажом не актуален. Отпускаю диалог. Если позже понадобится усилить удержание на канале {канал} — контакты тут.',
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
  customFinding?: { timecode: string; note: string }
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

  const sampleUrl = profile.sampleUrl || 'https://youtu.be/cZZgi5xn930';
  const basePortfolio = (profile.portfolioUrl || 'https://fleur-editor.netlify.app/').replace(/\/$/, '');
  const portfolioUrl = isEn ? `${basePortfolio}/` : `${basePortfolio}/ru/`;

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
