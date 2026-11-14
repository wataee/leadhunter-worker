export function isQuietHours(startHour = 23, endHour = 8): boolean {
  const currentHour = new Date().getHours();
  if (startHour > endHour) {
    return currentHour >= startHour || currentHour < endHour;
  }
  return currentHour >= startHour && currentHour < endHour;
}

// Web Audio API beep
export function playNotificationBeep(checkQuiet = false, quietStart = 23, quietEnd = 8): void {
  if (checkQuiet && isQuietHours(quietStart, quietEnd)) return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Audio might be blocked by browser autoplay policy
  }
}

// Browser notification
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const res = await Notification.requestPermission();
  return res === 'granted';
}

export function sendBrowserNotification(
  title: string,
  body: string,
  onClick?: () => void,
  checkQuiet = false,
  quietStart = 23,
  quietEnd = 8
): void {
  if (checkQuiet && isQuietHours(quietStart, quietEnd)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: 'leadhunter-vacancy',
    });

    if (onClick) {
      notif.onclick = () => {
        window.focus();
        onClick();
        notif.close();
      };
    }
  } catch {
    // Ignore notification error
  }
}

// Update document title with badge
export function updateTabBadge(count: number): void {
  const baseTitle = 'LeadHunter — Клиенты для видеомонтажёра';
  if (count > 0) {
    document.title = `(${count}) ${baseTitle}`;
  } else {
    document.title = baseTitle;
  }
}
