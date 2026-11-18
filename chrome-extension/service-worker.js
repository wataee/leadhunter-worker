chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.action === 'OPEN_SIDE_PANEL') {
        const windowId = message.windowId || sender?.tab?.windowId;
        if (windowId && chrome.sidePanel?.open) {
          await chrome.sidePanel.open({ windowId });
        }
        sendResponse({ ok: true });
        return;
      }

      if (message?.action === 'INGEST_UPWORK_JOB') {
        const stored = await chrome.storage.local.get(['apiBaseUrl', 'webhookSecret']);
        const baseUrl = String(stored.apiBaseUrl || 'https://fleurleads-work.netlify.app').replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (stored.webhookSecret) {
          headers['X-Webhook-Secret'] = String(stored.webhookSecret).trim();
        }

        const res = await fetch(`${baseUrl}/api/upwork-ingest`, {
          method: 'POST',
          headers,
          body: JSON.stringify(message.payload || {}),
          signal: AbortSignal.timeout(10000),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          sendResponse({
            ok: false,
            error: data?.error || `HTTP ${res.status}`,
          });
          return;
        }
        sendResponse({ ok: true, data });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown action' });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || 'Worker error' });
    }
  })();
  return true;
});
