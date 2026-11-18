/**
 * Upwork Copilot Engine:
 * - Connects ROI Score & client quality screening
 * - 200-char Upwork Proposal Preview Hook analyzer
 * - Zero-fluff English Cover Letter + Screening Answers + 45s Loom Script generator
 * - Raw Upwork job page text parser
 */

import { matchPortfolioDeepLink } from './portfolioMatcher.js';

const FLUFF_OPENING_REGEX =
  /(?:^|\b)(hi,?\s+my name is|hello,?\s+my name is|i hope this (?:message|email|proposal) finds you|dear hiring manager|to whom it may concern|i am a professional video editor with \d+|i have \d+\+?\s*years of experience|offering my video editing services)/i;

const JOB_RED_FLAG_REGEX =
  /(free\s*(?:sample|test|trial|edit)|unpaid\s*test|\$[1-9]\s*(?:per|\/)\s*(?:video|reel|short|hour|hr)|100\s*videos\s*for\s*\$?\d+|revenue\s*share\s*only|for\s*exposure)/i;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Evaluates whether spending Connects on an Upwork job has positive ROI.
 * @param {object} job
 */
export function calculateConnectsRoi(job = {}) {
  let score = 50;
  const redFlags = [];
  const greenFlags = [];

  const connectsRequired = Number(job.connectsRequired || 0);
  const connectsCostUsd = Number((connectsRequired * 0.15).toFixed(2));
  const combinedText = `${job.title || ''} ${job.description || ''}`;

  if (job.clientPaymentVerified === true) {
    score += 15;
    greenFlags.push('Payment Verified');
  } else if (job.clientPaymentVerified === false) {
    score -= 20;
    redFlags.push('Способ оплаты не подтверждён');
  }

  if (typeof job.clientHireRate === 'number' && !Number.isNaN(job.clientHireRate)) {
    if (job.clientHireRate >= 60) {
      score += 20;
      greenFlags.push(`Высокий Hire Rate: ${job.clientHireRate}%`);
    } else if (job.clientHireRate >= 40) {
      score += 10;
      greenFlags.push(`Hire Rate: ${job.clientHireRate}%`);
    } else if (job.clientHireRate < 20) {
      score -= 25;
      redFlags.push(`Низкий Hire Rate (${job.clientHireRate}%) — клиент редко нанимает`);
    }
  }

  if (typeof job.clientTotalSpent === 'number' && !Number.isNaN(job.clientTotalSpent)) {
    if (job.clientTotalSpent >= 5000) {
      score += 15;
      greenFlags.push(`Крупный заказчик ($${Math.round(job.clientTotalSpent).toLocaleString('en-US')}+ spent)`);
    } else if (job.clientTotalSpent >= 500) {
      score += 8;
      greenFlags.push(`История оплат: $${Math.round(job.clientTotalSpent).toLocaleString('en-US')}`);
    } else if (job.clientTotalSpent === 0) {
      score -= 10;
      redFlags.push('$0 потрачено на Upwork');
    }
  }

  if (typeof job.clientAvgHourlyRate === 'number' && !Number.isNaN(job.clientAvgHourlyRate) && job.clientAvgHourlyRate > 0) {
    if (job.clientAvgHourlyRate >= 25) {
      score += 15;
      greenFlags.push(`Высокий средний чек: $${job.clientAvgHourlyRate}/hr`);
    } else if (job.clientAvgHourlyRate < 10) {
      score -= 25;
      redFlags.push(`Демпинг-бюджет: средняя ставка $${job.clientAvgHourlyRate}/hr`);
    }
  }

  if (typeof job.proposalsCount === 'number' && !Number.isNaN(job.proposalsCount)) {
    if (job.proposalsCount < 10) {
      score += 15;
      greenFlags.push(`Мало заявок (${job.proposalsCount})`);
    } else if (job.proposalsCount <= 20) {
      score += 5;
      greenFlags.push(`Умеренная конкуренция (${job.proposalsCount} заявок)`);
    } else if (job.proposalsCount > 50) {
      score -= 25;
      redFlags.push(`Перегретый лот (50+ заявок)`);
    }
  }

  if (connectsRequired > 0) {
    if (connectsRequired <= 8) {
      score += 5;
    } else if (connectsRequired >= 20) {
      score -= 10;
      redFlags.push(`Высокая цена входа (${connectsRequired} Connects)`);
    }
  }

  if (JOB_RED_FLAG_REGEX.test(combinedText)) {
    score -= 30;
    redFlags.push('Подозрительные условия (бесплатный тест / слишком низкая цена)');
  }

  const roiScore = clamp(score, 0, 100);

  let recommendation;
  let badgeTextRu;
  let verdictRu;

  if (roiScore >= 75) {
    recommendation = 'apply_now';
    badgeTextRu = '🔥 Откликаться сразу';
    verdictRu = 'Сильный клиент с высоким шансом найма — смело инвестируй Connects.';
  } else if (roiScore >= 55) {
    recommendation = 'worth_it';
    badgeTextRu = '✅ Стоит откликнуться';
    verdictRu = 'Хороший баланс бюджета и конкуренции.';
  } else if (roiScore >= 38) {
    recommendation = 'caution';
    badgeTextRu = '⚠️ Осторожно';
    verdictRu = 'Есть риски по конкуренции или истории клиента. Откликайся только сильным хуком.';
  } else {
    recommendation = 'skip';
    badgeTextRu = '🛑 Не сливай Connects';
    verdictRu = 'Низкий шанс окупаемости Connects: слабые метрики клиента или перегретый лот.';
  }

  return {
    roiScore,
    recommendation,
    badgeTextRu,
    verdictRu,
    connectsRequired,
    connectsCostUsd,
    redFlags,
    greenFlags,
  };
}

/**
 * Inspects the critical first 200 characters shown in Upwork client proposal list.
 * @param {string} proposalText
 */
export function analyzeUpworkPreviewHook(proposalText = '') {
  const trimmed = String(proposalText || '').trim();
  const first200Chars = trimmed.slice(0, 200);
  const after200Chars = trimmed.slice(200);
  const hasFluffOpening = FLUFF_OPENING_REGEX.test(first200Chars);
  const hasLinkInPreview = /https?:\/\/\S+/i.test(first200Chars);
  const hasQuestion = trimmed.slice(-140).includes('?');

  const warnings = [];
  if (hasFluffOpening) {
    warnings.push('Уберите шаблонное приветствие («My name is... / I hope this finds you...») из первых 200 символов.');
  }
  if (!hasLinkInPreview && trimmed.length > 0) {
    warnings.push('Перенесите ссылку на релевантный кейс .fleur в первые 200 символов, чтобы клиент увидел её без раскрытия «More».');
  }
  if (!hasQuestion && trimmed.length > 0) {
    warnings.push('Добавьте короткий вопрос в конце для легкого ответа клиента.');
  }

  let previewScore = 100;
  if (hasFluffOpening) previewScore -= 45;
  if (!hasLinkInPreview) previewScore -= 30;
  if (!hasQuestion) previewScore -= 15;
  if (trimmed.length === 0) previewScore = 0;

  return {
    first200Chars,
    after200Chars,
    charCount: trimmed.length,
    hasFluffOpening,
    hasLinkInPreview,
    hasQuestion,
    previewScore: clamp(previewScore, 0, 100),
    warnings,
  };
}

/**
 * Generates an Upwork-optimized English Cover Letter (200-char hook + matched .fleur link),
 * screening question answers, and a 45-second Loom script.
 * @param {object} job
 * @param {object} [profile]
 */
export function generateUpworkProposal(job = {}, profile = {}) {
  const combined = `${job.title || ''} ${job.description || ''}`;
  const portfolio = matchPortfolioDeepLink({
    text: combined,
    region: 'US',
    lang: 'en',
    basePortfolioUrl: profile.portfolioUrl || 'https://fleur-editor.netlify.app',
  });

  const cleanTitle = String(job.title || 'your video project').replace(/\[[^\]]+\]\s*/g, '').trim();
  const shortTitle = cleanTitle.length > 52 ? `${cleanTitle.slice(0, 49)}...` : cleanTitle;
  const specLabel =
    portfolio.format === 'vertical'
      ? 'Reels/Shorts retention editing'
      : portfolio.niche === 'finance'
      ? 'YouTube explainer & motion graphics'
      : portfolio.niche === 'real_estate'
      ? 'commercial & brand editing'
      : 'YouTube & podcast editing';

  // Keep lines 1-2 ultra tight so both the hook AND .fleur link live inside the 200-char Upwork preview!
  const openingHook = `I can handle "${shortTitle}" end-to-end with ${specLabel}. Portfolio (${portfolio.labelEn}): ${portfolio.url}`;

  const coverLetter = [
    openingHook,
    '',
    'How we will execute cleanly:',
    '• Hook + tight pacing cut in Premiere Pro / DaVinci Resolve (zero dead air)',
    '• Clean motion callouts, sound design & captions engineered for watch-time',
    '• Frame-accurate timecode revisions + fast turnaround ready for upload',
    '',
    `Want me to recut a free 25-sec test clip from one of your raw files today so you can judge the pacing firsthand?`,
    '',
    `Best,\n${profile.name || 'Timur'}`,
  ].join('\n');

  const rawQuestions = Array.isArray(job.questions) ? job.questions : [];
  const screeningAnswers = rawQuestions
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .map((question) => {
      const lowerQ = question.toLowerCase();
      let answer;
      if (/rate|budget|cost|price|charge|hour/i.test(lowerQ)) {
        answer = `My rate is flexible depending on footage volume and graphics complexity (starting at $20/Short and $80+ per long-form cut) — happy to align within your target budget.`;
      } else if (/software|tool|program|premiere|davinci|after effects/i.test(lowerQ)) {
        answer = `Adobe Premiere Pro, After Effects (custom motion & callouts), and DaVinci Resolve (color grading & vocal mix).`;
      } else if (/turnaround|fast|timeline|hours|delivery|deadline/i.test(lowerQ)) {
        answer = `24 hours for short-form Reels/Shorts and 48–72 hours for full long-form YouTube episodes, with timecode-based revisions.`;
      } else if (/similar|sample|example|portfolio|link|previous/i.test(lowerQ)) {
        answer = `Here is the exact matching playlist from my portfolio (${portfolio.labelEn}): ${portfolio.url}`;
      } else {
        answer = `Yes — I handle end-to-end structure, pacing, motion callouts, sound mastering, and color grading so your footage turns around smoothly. Relevant work: ${portfolio.url}`;
      }
      return { question, answer };
    });

  const loomScript = [
    `[0:00-0:10 HOOK] Hey! Just read your brief for "${shortTitle}" — here is a quick 45-sec walkthrough of how I'd cut it.`,
    `[0:10-0:25 TIMELINE] (Show Premiere/AE timeline) Notice how I trim breath pauses and front-load a visual pattern interrupt in the first 5 seconds so viewers stay past 0:30.`,
    `[0:25-0:35 PROOF] You can inspect finished ${portfolio.labelEn} pieces at ${portfolio.url} — same pacing and audio polish.`,
    `[0:35-0:45 CTA] Send over one raw clip or reference link and I will cut a quick 25-sec sample today. Talk soon!`,
  ].join('\n\n');

  const previewAnalysis = analyzeUpworkPreviewHook(coverLetter);

  return {
    coverLetter,
    portfolioUrl: portfolio.url,
    portfolioLabel: portfolio.labelEn,
    screeningAnswers,
    loomScript,
    previewAnalysis,
  };
}

/**
 * Parses a raw copy-pasted Upwork job posting block into structured metrics & questions.
 * @param {string} rawText
 */
export function parseUpworkPastedText(rawText = '') {
  const clean = String(rawText || '').replace(/\r/g, '').trim();
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const title = lines[0] || 'Upwork Video Editing Project';

  let connectsRequired = 0;
  const connectsMatch = clean.match(/(\d{1,3})\s*Connects/i);
  if (connectsMatch) {
    connectsRequired = parseInt(connectsMatch[1], 10) || 0;
  }

  let clientHireRate = null;
  const hireMatch = clean.match(/(\d{1,3})\s*%\s*hire\s*rate/i);
  if (hireMatch) {
    clientHireRate = parseInt(hireMatch[1], 10);
  }

  let clientTotalSpent = null;
  const spentMatch = clean.match(/\$([\d.,]+)\s*([kKmM])?\s*\+?\s*(?:total\s*)?spent/i);
  if (spentMatch) {
    const base = parseFloat(spentMatch[1].replace(/,/g, ''));
    const mult =
      spentMatch[2]?.toLowerCase() === 'm'
        ? 1_000_000
        : spentMatch[2]?.toLowerCase() === 'k'
        ? 1_000
        : 1;
    if (!Number.isNaN(base)) {
      clientTotalSpent = base * mult;
    }
  }

  let clientAvgHourlyRate = null;
  const avgHourlyMatch = clean.match(/\$([\d.,]+)\s*\/hr\s*avg\s*hourly\s*rate/i);
  if (avgHourlyMatch) {
    const parsed = parseFloat(avgHourlyMatch[1].replace(/,/g, ''));
    if (!Number.isNaN(parsed)) clientAvgHourlyRate = parsed;
  }

  let clientPaymentVerified = null;
  if (/payment\s*(?:method\s*)?verified/i.test(clean)) {
    clientPaymentVerified = true;
  } else if (/payment\s*(?:method\s*)?(?:not\s*verified|unverified)/i.test(clean)) {
    clientPaymentVerified = false;
  }

  let proposalsCount = null;
  if (/less\s*than\s*5/i.test(clean)) {
    proposalsCount = 3;
  } else if (/5\s*to\s*10/i.test(clean)) {
    proposalsCount = 7;
  } else if (/10\s*to\s*15/i.test(clean)) {
    proposalsCount = 12;
  } else if (/15\s*to\s*20/i.test(clean)) {
    proposalsCount = 17;
  } else if (/20\s*to\s*50/i.test(clean)) {
    proposalsCount = 30;
  } else if (/50\+/i.test(clean)) {
    proposalsCount = 55;
  }

  const questions = [];
  const qMarkerIndex = lines.findIndex((l) =>
    /(?:answer the following questions|screening questions|questions)/i.test(l)
  );
  if (qMarkerIndex >= 0) {
    for (let i = qMarkerIndex + 1; i < Math.min(lines.length, qMarkerIndex + 8); i++) {
      const candidate = lines[i].replace(/^[\d.\-*•]+\s*/, '').trim();
      if (candidate.endsWith('?') || candidate.length > 15) {
        questions.push(candidate);
      }
    }
  }

  const urlMatch = clean.match(/https:\/\/(?:www\.)?upwork\.com\/jobs\/[^\s)]+/i);

  return {
    title,
    description: clean,
    url: urlMatch ? urlMatch[0] : 'https://www.upwork.com/nx/find-work/',
    connectsRequired,
    clientHireRate,
    clientTotalSpent,
    clientAvgHourlyRate,
    clientPaymentVerified,
    proposalsCount,
    questions,
  };
}
