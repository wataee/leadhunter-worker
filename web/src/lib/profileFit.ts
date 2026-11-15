import { Vacancy, UserProfile } from '../types';

export type FitLevel = 'great' | 'fair' | 'poor';

export interface ProfileFitResult {
  level: FitLevel;
  label: 'Подходит' | 'Возможно' | 'Мимо';
  reason: string;
}

export function getProfileFitLevel(vacancy: Vacancy, profile?: UserProfile): ProfileFitResult {
  if (vacancy.qualityTier === 'shady' || (vacancy.risks && vacancy.risks.length > 0)) {
    return { level: 'poor', label: 'Мимо', reason: 'Подозрительные условия' };
  }

  const textLower = (vacancy.text || '').toLowerCase();
  const userSkills = profile?.skills || [];
  const userFormats = profile?.formats || [];

  const matchedSkills: string[] = [];
  for (const s of userSkills) {
    const sl = s.toLowerCase();
    if (
      (sl.includes('premiere') && (textLower.includes('premiere') || textLower.includes('премьер'))) ||
      ((sl.includes('after') || sl.includes('ae')) && (textLower.includes('after effects') || /\bae\b/i.test(textLower) || textLower.includes('афтер'))) ||
      (sl.includes('davinci') && (textLower.includes('davinci') || textLower.includes('давинчи') || textLower.includes('resolve'))) ||
      (sl.includes('capcut') && (textLower.includes('capcut') || textLower.includes('капкат')))
    ) {
      matchedSkills.push(s);
    }
  }

  let matchedFormat = false;
  let formatLabel = '';
  if (userFormats.includes('Shorts/Reels') && (vacancy.formatTag === 'short' || /shorts|reels|тикто|вертикал|клип/i.test(textLower))) {
    matchedFormat = true;
    formatLabel = 'Reels / Shorts';
  } else if (userFormats.includes('YouTube') && (vacancy.formatTag === 'long' || /youtube|ютуб|длинн|горизонтал|выпуск/i.test(textLower))) {
    matchedFormat = true;
    formatLabel = 'YouTube';
  } else if (userFormats.includes('Подкасты') && /подкаст|интервью|podcast/i.test(textLower)) {
    matchedFormat = true;
    formatLabel = 'Подкасты';
  }

  if (matchedSkills.length > 0 && matchedFormat) {
    return {
      level: 'great',
      label: 'Подходит',
      reason: `Совпадает софт (${matchedSkills.slice(0, 2).join(', ')}) и формат (${formatLabel})`,
    };
  }

  if (matchedSkills.length > 0) {
    return {
      level: 'great',
      label: 'Подходит',
      reason: `Требуется ваш стек: ${matchedSkills.slice(0, 2).join(', ')}`,
    };
  }

  if (matchedFormat) {
    return {
      level: 'great',
      label: 'Подходит',
      reason: `Ваш формат: ${formatLabel}`,
    };
  }

  const foreign3d = /blender|cinema\s*4d|maya|houdini|unreal/i.test(textLower);
  if (foreign3d && !userSkills.some((s) => /blender|3d|maya/i.test(s))) {
    return {
      level: 'poor',
      label: 'Мимо',
      reason: 'Требуется 3D-графика вне вашего профиля',
    };
  }

  return {
    level: 'fair',
    label: 'Возможно',
    reason: 'Общий монтаж видео',
  };
}

export function computeProfileFit(vacancy: Vacancy, profile?: UserProfile): number {
  if (!profile) return vacancy.relevance || 50;

  let score = 25; // baseline

  // 1. Skills match (up to 35 pts)
  const userSkills = profile.skills || [];
  const textLower = (vacancy.text || '').toLowerCase();

  if (userSkills.length > 0) {
    const matchedSkills = userSkills.filter((skill) => {
      const s = skill.toLowerCase();
      if (s.includes('premiere')) {
        return textLower.includes('premiere') || textLower.includes('премьер');
      }
      if (s.includes('after') || s.includes('ae')) {
        return textLower.includes('after effects') || /\bae\b/i.test(textLower) || textLower.includes('афтер');
      }
      if (s.includes('davinci')) {
        return textLower.includes('davinci') || textLower.includes('давинчи') || textLower.includes('resolve');
      }
      if (s.includes('capcut')) {
        return textLower.includes('capcut') || textLower.includes('капкат');
      }
      if (s.includes('blender')) {
        return textLower.includes('blender') || textLower.includes('блендер') || textLower.includes('3d');
      }
      if (s.includes('photoshop')) {
        return textLower.includes('photoshop') || textLower.includes('фотошоп') || /\bps\b/i.test(textLower);
      }
      if (s.includes('final cut')) {
        return textLower.includes('final cut') || textLower.includes('файнал');
      }
      return textLower.includes(s);
    });

    if (matchedSkills.length > 0) {
      score += Math.min(35, 15 + matchedSkills.length * 10);
    } else {
      const softwareDemanded = /premiere|after effects|\bae\b|davinci|capcut|blender|final cut|photoshop/i.test(textLower);
      if (!softwareDemanded) {
        score += 15; // neutral if no strict software was specified
      }
    }
  } else {
    score += 20;
  }

  // 2. Format match (up to 25 pts)
  const userFormats = profile.formats || [];
  if (userFormats.length > 0) {
    let matchedFormat = false;

    if (userFormats.includes('Shorts/Reels') && (vacancy.formatTag === 'short' || /shorts|reels|тикто|вертикал|клип/i.test(textLower))) {
      matchedFormat = true;
    }
    if (userFormats.includes('YouTube') && (vacancy.formatTag === 'long' || /youtube|ютуб|длинн|горизонтал|выпуск/i.test(textLower))) {
      matchedFormat = true;
    }
    if (userFormats.includes('Подкасты') && /подкаст|интервью|podcast/i.test(textLower)) {
      matchedFormat = true;
    }
    if (userFormats.includes('Реклама') && /реклам|промо|promo|commercial|креатив/i.test(textLower)) {
      matchedFormat = true;
    }

    if (matchedFormat) {
      score += 25;
    } else if (!vacancy.formatTag && !/shorts|reels|подкаст|реклам|интервью/i.test(textLower)) {
      score += 12; // neutral
    }
  } else {
    score += 15;
  }

  // 3. Budget match (up to 25 pts)
  if (profile.minRate && profile.minRate > 0) {
    if (vacancy.budget && (vacancy.budget.max !== null || vacancy.budget.min !== null)) {
      const val = vacancy.budget.max ?? vacancy.budget.min ?? 0;
      if (val >= profile.minRate) {
        score += 25;
      } else if (val >= profile.minRate * 0.7) {
        score += 10;
      } else {
        score -= 10; // penalty for low pay
      }
    } else {
      score += 12; // negotiable or unstated
    }
  } else {
    score += 15;
  }

  return Math.max(5, Math.min(99, Math.round(score)));
}
