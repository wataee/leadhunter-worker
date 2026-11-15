/**
 * LeadHunter - Vacancy Parser (Structured extraction & Closed detector)
 */

export interface StructuredVacancyData {
  deadline?: string;
  duration?: string;
  footage?: 'ready' | 'raw' | 'none' | 'unknown';
  footageText?: string;
  software: string[];
  isClosed: boolean;
  closedReason?: string;
}

const SOFTWARE_MAP: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Premiere Pro', pattern: /premiere\s*pro|премьер|pr\b/i },
  { name: 'After Effects', pattern: /after\s*effects|афтер\s*эффектс|ae\b/i },
  { name: 'DaVinci Resolve', pattern: /davinci|давинчи|resolve/i },
  { name: 'CapCut', pattern: /capcut|капкат/i },
  { name: 'Blender', pattern: /blender|блендер/i },
  { name: 'Photoshop', pattern: /photoshop|фотошоп|ps\b/i },
  { name: 'Final Cut', pattern: /final\s*cut|файнал\s*кат|fcpx/i },
];

const CLOSED_PATTERNS = [
  /нашли\b/i,
  /исполнитель найден/i,
  /человек найден/i,
  /вакансия закрыта/i,
  /набор закрыт/i,
  /стоп\s*при[её]м/i,
  /не\s*актуально/i,
  /неактуально/i,
  /закрыто/i,
  /closed\b/i,
  /position filled/i,
];

export function parseStructuredVacancy(text: string): StructuredVacancyData {
  if (!text) {
    return { software: [], isClosed: false };
  }

  // 1. Detect closed status (3.7)
  let isClosed = false;
  let closedReason: string | undefined;

  for (const pattern of CLOSED_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      isClosed = true;
      closedReason = match[0];
      break;
    }
  }

  // 2. Detect software
  const software: string[] = [];
  for (const sw of SOFTWARE_MAP) {
    if (sw.pattern.test(text)) {
      software.push(sw.name);
    }
  }

  // 3. Detect duration / format
  let duration: string | undefined;
  if (/(\d+)\s*[-–]\s*(\d+)\s*(?:сек|секунд|sec|s\b)/i.test(text)) {
    const m = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:сек|секунд|sec|s\b)/i);
    duration = `${m![1]}-${m![2]} сек`;
  } else if (/(\d+)\s*(?:сек|секунд|sec|s\b)/i.test(text)) {
    const m = text.match(/(\d+)\s*(?:сек|секунд|sec|s\b)/i);
    duration = `${m![1]} сек`;
  } else if (/(\d+)\s*[-–]\s*(\d+)\s*(?:мин|минут|min|m\b)/i.test(text)) {
    const m = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:мин|минут|min|m\b)/i);
    duration = `${m![1]}-${m![2]} мин`;
  } else if (/(\d+)\s*(?:мин|минут|min|m\b)/i.test(text)) {
    const m = text.match(/(\d+)\s*(?:мин|минут|min|m\b)/i);
    duration = `${m![1]} мин`;
  } else if (/рилс|шортс|shorts|reels|tiktok/i.test(text)) {
    duration = 'Reels/Shorts (<60с)';
  } else if (/подкаст|podcast/i.test(text)) {
    duration = 'Подкаст (30-60+ мин)';
  }

  // 4. Detect footage status
  let footage: 'ready' | 'raw' | 'none' | 'unknown' = 'unknown';
  let footageText: string | undefined;

  if (/исходники\s*есть|материал\s*готов|тз\s*готово|есть\s*исходники/i.test(text)) {
    footage = 'ready';
    footageText = 'Исходники и ТЗ готовы';
  } else if (/сырой\s*материал|сырые\s*исходники|много\s*материала/i.test(text)) {
    footage = 'raw';
    footageText = 'Сырой материал';
  } else if (/без\s*исходников|найти\s*материал|сток|стоковые/i.test(text)) {
    footage = 'none';
    footageText = 'Поиск стоков / без исходников';
  }

  // 5. Detect deadline
  let deadline: string | undefined;
  if (/срочно|asap|сегодня|до\s*вечера|горят\s*сроки/i.test(text)) {
    deadline = '🔥 Срочно (1-2 дня)';
  } else if (/до\s*(\d{1,2}[./]\d{1,2})/i.test(text)) {
    const m = text.match(/до\s*(\d{1,2}[./]\d{1,2})/i);
    deadline = `До ${m![1]}`;
  } else if (/дедлайн\s*[:-]\s*([^\n,.]{3,20})/i.test(text)) {
    const m = text.match(/дедлайн\s*[:-]\s*([^\n,.]{3,20})/i);
    deadline = m![1].trim();
  }

  return {
    deadline,
    duration,
    footage,
    footageText,
    software,
    isClosed,
    closedReason,
  };
}
