import { Lead } from '../types';

export function exportLeadsToCsv(leads: Lead[], filename = 'leadhunter_leads.csv'): void {
  const headers = [
    'ID',
    'Название / Имя',
    'Ниша',
    'Подписчики',
    'Тир',
    'Lead Score',
    'Статус',
    'Источник',
    'Telegram',
    'Email',
    'Instagram',
    'Сайт',
    'Ссылка на канал',
    'Последнее видео',
    'Есть продукт',
    'Касаний',
    'Следующее касание',
    'Сумма сделки',
    'Валюта',
    'Теги',
    'Заметки',
    'Создан',
  ];

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = leads.map((lead) => [
    escapeCsv(lead.id),
    escapeCsv(lead.name),
    escapeCsv(lead.niche),
    escapeCsv(lead.hiddenSubscribers ? 'Скрыто' : lead.subscribers),
    escapeCsv(lead.tier === 1 ? 'VIP (T1)' : lead.tier === 2 ? 'Перспективный (T2)' : 'Обычный (T3)'),
    escapeCsv(lead.score),
    escapeCsv(lead.status),
    escapeCsv(lead.source),
    escapeCsv(lead.telegram || ''),
    escapeCsv(lead.email || ''),
    escapeCsv(lead.instagram || ''),
    escapeCsv(lead.website || ''),
    escapeCsv(lead.channelUrl),
    escapeCsv(lead.lastVideo?.url || ''),
    escapeCsv(lead.hasProduct ? 'Да' : 'Нет'),
    escapeCsv(lead.touches?.length || 0),
    escapeCsv(lead.nextTouchAt || ''),
    escapeCsv(lead.dealValue || 0),
    escapeCsv(lead.currency || 'USD'),
    escapeCsv((lead.tags || []).join('; ')),
    escapeCsv(lead.notes || ''),
    escapeCsv(lead.createdAt || ''),
  ]);

  const csvContent = [
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\r\n');

  // Prepend UTF-8 BOM (\uFEFF)
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
