import { PitchTemplate, Lead, UserProfile } from '../types';

export const DEFAULT_TEMPLATES: PitchTemplate[] = [
  {
    id: 'tpl_shotgun',
    type: 'shotgun',
    title: 'Отклик на вакансию',
    body: 'Привет, {имя}! Увидел вашу вакансию на монтаж. Делаю именно такой формат, вот работы: {ссылка_портфолио}. Готов сделать тестовый фрагмент прямо сейчас. Вы ещё ищете?',
  },
  {
    id: 'tpl_sniper',
    type: 'sniper',
    title: 'Разбор ролика (вопрос по таймкоду)',
    body: 'Вопрос по твоему видео про {тема_ролика}: на {таймкод} {проблема}. Есть идея, как это исправить. Не против, если покажу?',
  },
  {
    id: 'tpl_fire_question',
    type: 'fire_question',
    title: 'Предложение идеи по ролику',
    body: 'Привет, {имя}! Обратил внимание на канал {канал}. В ролике про {тема_ролика} на {таймкод} {проблема}. Собрал идею, как перестроить этот блок и поднять удержание на 15-20%. Показать набросок?',
  },
  {
    id: 'tpl_fire_sample',
    type: 'fire_sample',
    title: 'Готовый пример перемонтажа',
    body: '{имя}, привет! Перемонтировал динамичный фрагмент твоего видео про {тема_ролика} (исправил {проблема} на {таймкод}): {ссылка_сэмпла}. Заценишь?',
  },
  {
    id: 'tpl_followup_1',
    type: 'followup_1',
    title: 'Повторное сообщение 1 (напоминание)',
    body: 'Привет, просто поднимаю сообщение выше, возможно, потерялось. Если решили двигаться в другом направлении — без проблем, просто дай знать.',
  },
  {
    id: 'tpl_followup_2',
    type: 'followup_2',
    title: 'Повторное сообщение 2 (финальное)',
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

export function substituteVariables(
  templateBody: string,
  lead: Partial<Lead> | null,
  profile: UserProfile,
  customFinding?: { timecode: string; note: string }
): string {
  let result = templateBody;

  const leadName = lead?.name || 'коллега';
  const channelName = lead?.name || 'YouTube канал';
  const topic = lead?.lastVideo?.title || 'твоем последнем видео';

  const timecode = customFinding?.timecode || lead?.findings?.[0]?.timecode || '01:20';
  const problem = customFinding?.note || lead?.findings?.[0]?.note || 'затянутый переход';

  const sampleUrl = profile.sampleUrl || 'https://youtu.be/sample';
  const portfolioUrl = profile.portfolioUrl || 'https://fleur-editor.netlify.app/ru/';

  result = result
    .replace(/{имя}/g, leadName)
    .replace(/{канал}/g, channelName)
    .replace(/{тема_ролика}/g, topic)
    .replace(/{таймкод}/g, timecode)
    .replace(/{проблема}/g, problem)
    .replace(/{ссылка_портфолио}/g, portfolioUrl)
    .replace(/{ссылка_сэмпла}/g, sampleUrl)
    .replace(/{моё_имя}/g, profile.name || 'монтажер')
    .replace(/{моя_специализация}/g, profile.specialization || 'видеомонтаж для YouTube');

  return result;
}

export function analyzePitchQuality(text: string): QualityAnalysis {
  const trimmed = text.trim();
  const length = trimmed.length;
  const isTooLong = length > 450;

  // Specifics check: timecode or quotes or numbers
  const hasTimecode = /\d{1,2}:\d{2}/.test(trimmed);
  const hasSpecifics = hasTimecode || /(секунд|минут|ролик|канал|фрагмент)/i.test(trimmed);

  // Question check: question mark within the last 45 characters
  const endSlice = trimmed.slice(-45);
  const missingQuestion = !endSlice.includes('?');

  // Banned phrase: "услуги монтажа"
  const hasBannedPhrases = /услуг[иае]\s+монтажа/i.test(trimmed);

  // Preview line: first 60 chars
  const previewLine = trimmed.slice(0, 60);
  const lowerPreview = previewLine.toLowerCase();
  const genericPreview =
    lowerPreview.startsWith('привет, мне очень нравится') ||
    lowerPreview.startsWith('здравствуйте, меня зовут') ||
    lowerPreview.startsWith('добрый день, меня зовут');

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
