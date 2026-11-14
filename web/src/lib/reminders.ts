import { Lead } from '../types';
import { isOverdue, isToday } from './time';
import { sendBrowserNotification } from './notifications';

export function getDueFollowUps(leads: Lead[]): Lead[] {
  return leads.filter((l) => {
    if (l.status === 'closed' || l.status === 'rejected') return false;
    return isOverdue(l.nextTouchAt) || isToday(l.nextTouchAt);
  });
}

export async function notifyFollowUps(
  dueLeads: Lead[],
  options: {
    sendBrowser?: boolean;
    sendTelegram?: boolean;
    onLeadClick?: (lead: Lead) => void;
  } = {}
): Promise<number> {
  if (!dueLeads || dueLeads.length === 0) return 0;

  let notified = 0;

  // 1. Browser Notification
  if (options.sendBrowser) {
    if (dueLeads.length === 1) {
      const lead = dueLeads[0];
      sendBrowserNotification(
        '⏰ Пора отправить фоллоу-ап!',
        `Клиент ${lead.name} ожидает ответа. Нажмите, чтобы открыть карточку.`,
        () => options.onLeadClick?.(lead)
      );
      notified++;
    } else {
      sendBrowserNotification(
        '⏰ Пора отправить фоллоу-ап!',
        `Требуется связаться с ${dueLeads.length} клиентами сегодня.`,
        () => options.onLeadClick?.(dueLeads[0])
      );
      notified += dueLeads.length;
    }
  }

  // 2. Telegram Notification
  if (options.sendTelegram) {
    for (const lead of dueLeads.slice(0, 3)) {
      try {
        const url = lead.channelUrl && lead.channelUrl.startsWith('https://t.me')
          ? lead.channelUrl
          : 'https://t.me';

        await fetch('/api/tg-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '⏰ Напоминание о фоллоу-апе',
            text: `Клиент ${lead.name} (${lead.telegram || lead.channelUrl}) ожидает повторного касания в воронке.`,
            url,
          }),
        });
      } catch {
        // background notification best effort
      }
    }
  }

  return notified;
}
