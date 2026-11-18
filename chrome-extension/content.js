function extractUpworkJobFromDom() {
  const titleEl =
    document.querySelector('h1') ||
    document.querySelector('[data-test="job-title"]') ||
    document.querySelector('header h4');
  const descEl =
    document.querySelector('[data-test="Description"]') ||
    document.querySelector('[data-test="job-description-text"]') ||
    document.querySelector('.job-description');

  const bodyText = document.body?.innerText || '';
  const title = (titleEl?.textContent || document.title || 'Upwork Video Editing Job').trim();
  const description = (descEl?.textContent || bodyText.slice(0, 3500)).trim();

  const connectsMatch = bodyText.match(/(\d{1,3})\s*Connects/i);
  const hireMatch = bodyText.match(/(\d{1,3})\s*%\s*hire\s*rate/i);
  const spentMatch = bodyText.match(/\$([\d.,]+)\s*([kKmM])?\s*\+?\s*(?:total\s*)?spent/i);
  const hourlyMatch = bodyText.match(/\$([\d.,]+)\s*\/hr\s*avg\s*hourly\s*rate/i);

  let clientTotalSpent = null;
  if (spentMatch) {
    const base = parseFloat(spentMatch[1].replace(/,/g, ''));
    const mult =
      spentMatch[2]?.toLowerCase() === 'm'
        ? 1_000_000
        : spentMatch[2]?.toLowerCase() === 'k'
        ? 1_000
        : 1;
    if (!Number.isNaN(base)) clientTotalSpent = base * mult;
  }

  let proposalsCount = null;
  if (/less\s*than\s*5/i.test(bodyText)) proposalsCount = 3;
  else if (/5\s*to\s*10/i.test(bodyText)) proposalsCount = 7;
  else if (/10\s*to\s*15/i.test(bodyText)) proposalsCount = 12;
  else if (/15\s*to\s*20/i.test(bodyText)) proposalsCount = 17;
  else if (/20\s*to\s*50/i.test(bodyText)) proposalsCount = 30;
  else if (/50\+/i.test(bodyText)) proposalsCount = 55;

  const clientPaymentVerified = /payment\s*(?:method\s*)?verified/i.test(bodyText)
    ? true
    : /payment\s*(?:method\s*)?(?:not\s*verified|unverified)/i.test(bodyText)
    ? false
    : null;

  const questionEls = Array.from(
    document.querySelectorAll('[data-test="questions-section"] label, .fe-proposal-job-questions label, ol li')
  );
  const questions = questionEls
    .map((el) => el.textContent?.trim() || '')
    .filter((q) => q.length > 8 && q.length < 300)
    .slice(0, 6);

  return {
    title,
    description,
    url: window.location.href,
    connectsRequired: connectsMatch ? parseInt(connectsMatch[1], 10) : 0,
    clientHireRate: hireMatch ? parseInt(hireMatch[1], 10) : null,
    clientTotalSpent,
    clientAvgHourlyRate: hourlyMatch ? parseFloat(hourlyMatch[1].replace(/,/g, '')) : null,
    clientPaymentVerified,
    proposalsCount,
    questions,
  };
}

function insertProposalIntoCoverLetter(text) {
  const selectors = [
    'textarea[aria-labelledby*="cover"]',
    'textarea[name*="cover"]',
    '.cover-letter-area textarea',
    'textarea',
  ];

  for (const sel of selectors) {
    const textarea = document.querySelector(sel);
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, text);
      } else {
        textarea.value = text;
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

function injectFloatingCopilotButton() {
  if (!/upwork\.com\/(?:jobs|nx\/proposals)/i.test(window.location.href)) return;
  if (document.getElementById('leadhunter-upwork-fab')) return;

  const btn = document.createElement('button');
  btn.id = 'leadhunter-upwork-fab';
  btn.type = 'button';
  btn.textContent = '⚡ LeadHunter Copilot';
  btn.style.cssText = [
    'position:fixed',
    'right:20px',
    'bottom:20px',
    'z-index:99999',
    'padding:10px 14px',
    'border-radius:9999px',
    'border:1px solid rgba(16,185,129,0.5)',
    'background:#0f172a',
    'color:#34d399',
    'font:600 12px/1.2 system-ui,sans-serif',
    'cursor:pointer',
    'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
  ].join(';');

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' }).catch(() => {});
  });

  document.body?.appendChild(btn);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'EXTRACT_UPWORK_JOB') {
    sendResponse({ ok: true, job: extractUpworkJobFromDom() });
    return false;
  }

  if (message?.action === 'INSERT_PROPOSAL') {
    const inserted = insertProposalIntoCoverLetter(String(message.text || ''));
    sendResponse({ ok: inserted });
    return false;
  }

  return false;
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  injectFloatingCopilotButton();
} else {
  window.addEventListener('DOMContentLoaded', injectFloatingCopilotButton, { once: true });
}
