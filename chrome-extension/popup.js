const jobInput = document.getElementById('job-input');
const roiCard = document.getElementById('roi-card');
const roiBadge = document.getElementById('roi-badge');
const roiVerdict = document.getElementById('roi-verdict');
const roiFlags = document.getElementById('roi-flags');
const translationCard = document.getElementById('translation-card');
const translatedTextEl = document.getElementById('translated-text');
const proposalCard = document.getElementById('proposal-card');
const preview200 = document.getElementById('preview-200');
const hookScore = document.getElementById('hook-score');
const proposalOutput = document.getElementById('proposal-output');
const loomOutput = document.getElementById('loom-output');
const statusLine = document.getElementById('status-line');
const apiUrlInput = document.getElementById('api-url-input');
const secretInput = document.getElementById('secret-input');

let lastExtractedJob = null;

function setStatus(msg) {
  statusLine.textContent = msg;
}

function localFallbackAnalyze(text, meta = {}) {
  const lower = text.toLowerCase();
  const isVertical = /\b(reels|shorts|tiktok|vertical|9:16)\b/i.test(lower);
  const isFinance = /\b(ai|saas|crypto|finance|tech|startup)\b/i.test(lower);
  const url = isFinance
    ? 'https://fleur-editor.netlify.app/?niche=finance#work'
    : isVertical
    ? 'https://fleur-editor.netlify.app/?format=vertical#work'
    : 'https://fleur-editor.netlify.app/?niche=personal_brand#work';

  const title = (meta.title || text.split('\n')[0] || 'Your video project').slice(0, 48);
  const coverLetter = [
    `I can handle "${title}" end-to-end with retention editing. Portfolio: ${url}`,
    '',
    '• Clean pacing, hook in first 5s & sound design (Premiere / After Effects / DaVinci)',
    '• Frame-accurate timecode revisions + fast turnaround',
    'Want a free 25-sec test cut from one raw clip today?',
  ].join('\n');

  const first200 = coverLetter.slice(0, 200);
  const connectsMatch = text.match(/(\d{1,3})\s*Connects/i);
  const connects = meta.connectsRequired || (connectsMatch ? parseInt(connectsMatch[1], 10) : 12);
  let score = 60;
  if (/payment\s*method\s*verified/i.test(lower) || meta.clientPaymentVerified) score += 15;
  if (/free\s*sample|unpaid\s*test|\$[1-5]\s*per/i.test(lower)) score -= 30;
  if (connects >= 20) score -= 10;
  score = Math.max(0, Math.min(100, score));

  return {
    roi: {
      roiScore: score,
      badgeTextRu: score >= 65 ? '🔥 Хороший заказ' : score >= 45 ? '✅ Нормально' : '🛑 Риск слива',
      verdictRu: 'Локальный расчёт (укажите WEBHOOK_SECRET в настройках для сохранения и перевода через Netlify).',
      greenFlags: [`Portfolio URL: ${url}`],
      redFlags: [],
    },
    proposal: {
      coverLetter,
      loomScript: `[0:00-0:10] Hey! Quick walkthrough for "${title}".\n[0:10-0:30] Show AE/Premiere pacing cut.\n[0:30-0:45] Portfolio: ${url}`,
      previewAnalysis: { first200Chars: first200, previewScore: 95 },
    },
    translatedRu: null,
  };
}

function renderResult(result) {
  const { roi, proposal, translatedRu } = result;
  roiCard.classList.remove('hidden');
  roiBadge.textContent = `${roi.roiScore}/100 · ${roi.badgeTextRu}`;
  roiVerdict.textContent = roi.verdictRu || '';

  const flagItems = [
    ...(roi.greenFlags || []).map((f) => `✅ ${f}`),
    ...(roi.redFlags || []).map((f) => `⚠️ ${f}`),
  ];
  roiFlags.replaceChildren(
    ...flagItems.map((txt) => {
      const li = document.createElement('li');
      li.textContent = txt;
      return li;
    })
  );

  if (translatedRu) {
    translationCard.classList.remove('hidden');
    translatedTextEl.textContent = translatedRu;
  } else {
    translationCard.classList.add('hidden');
  }

  proposalCard.classList.remove('hidden');
  preview200.textContent = proposal.previewAnalysis?.first200Chars || proposal.coverLetter.slice(0, 200);
  hookScore.textContent = `Hook ${proposal.previewAnalysis?.previewScore ?? 90}/100`;
  proposalOutput.value = proposal.coverLetter;
  loomOutput.value = proposal.loomScript || '';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById('open-sidepanel-btn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab?.windowId && chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

document.getElementById('scan-tab-btn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes('upwork.com')) {
    setStatus('Откройте страницу вакансии на upwork.com или вставьте текст вручную.');
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_UPWORK_JOB' });
    if (resp?.ok && resp.job) {
      lastExtractedJob = resp.job;
      jobInput.value = `${resp.job.title}\n\n${resp.job.description}`.trim();
      setStatus(`Считано: "${resp.job.title.slice(0, 40)}" (${resp.job.connectsRequired || 0} Connects)`);
    }
  } catch {
    setStatus('Не удалось прочитать DOM вкладки — обновите страницу Upwork.');
  }
});

document.getElementById('analyze-btn').addEventListener('click', async () => {
  const raw = jobInput.value.trim();
  if (!raw) {
    setStatus('Сначала считайте вакансию или вставьте её текст.');
    return;
  }

  setStatus('Анализирую заказ...');
  const payload = lastExtractedJob
    ? { ...lastExtractedJob, text: raw }
    : { text: raw };

  const workerResp = await chrome.runtime.sendMessage({
    action: 'INGEST_UPWORK_JOB',
    payload,
  });

  if (workerResp?.ok && workerResp.data) {
    renderResult(workerResp.data);
    setStatus('Готово и сохранено в ленту LeadHunter!');
  } else {
    renderResult(localFallbackAnalyze(raw, lastExtractedJob || {}));
    setStatus(`Локальный режим (${workerResp?.error || 'нет авторизации API'})`);
  }
});

document.getElementById('copy-proposal-btn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(proposalOutput.value);
  setStatus('Cover Letter скопирован в буфер!');
});

document.getElementById('insert-proposal-btn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const resp = await chrome.tabs.sendMessage(tab.id, {
    action: 'INSERT_PROPOSAL',
    text: proposalOutput.value,
  });
  setStatus(resp?.ok ? 'Вставлено в поле Cover Letter на Upwork!' : 'Поле Cover Letter не найдено — скопируйте вручную.');
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  await chrome.storage.local.set({
    apiBaseUrl: apiUrlInput.value.trim() || 'https://fleurleads-work.netlify.app',
    webhookSecret: secretInput.value.trim(),
  });
  setStatus('Настройки сохранены.');
});

(async () => {
  const stored = await chrome.storage.local.get(['apiBaseUrl', 'webhookSecret']);
  apiUrlInput.value = stored.apiBaseUrl || 'https://fleurleads-work.netlify.app';
  secretInput.value = stored.webhookSecret || '';
})();
