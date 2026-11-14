export function formatRelativeTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'только что';
  }
  if (diffMin < 60) {
    return `${diffMin} мин назад`;
  }
  if (diffHour < 24) {
    return `${diffHour} ч назад`;
  }
  if (diffDay === 1) {
    return 'вчера';
  }
  if (diffDay < 30) {
    return `${diffDay} дн назад`;
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function formatDate(dateString: string): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isOverdue(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  const target = new Date(dateString);
  const now = new Date();
  // Set to midnight for day comparison
  target.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return target.getTime() < today.getTime();
}

export function isToday(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  const target = new Date(dateString);
  const now = new Date();
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  );
}

export function addDays(days: number, fromDate: Date = new Date()): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
