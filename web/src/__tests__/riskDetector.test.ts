import { describe, it, expect } from 'vitest';
import { detectVacancyRisks } from '../shared/filter.js';

describe('5.4 detectVacancyRisks', () => {
  it('detects unpaid test task on full video', () => {
    const text = 'Нужен монтажер. Сделайте бесплатное тестовое задание на весь ролик 10 минут.';
    const res = detectVacancyRisks(text);
    expect(res.isRisky).toBe(true);
    expect(res.reasons.some((r: string) => r.includes('тестовое'))).toBe(true);
  });

  it('detects "за опыт" and percent instead of pay', () => {
    const text = 'Ищем начинающего монтажера в команду. Работа за опыт, оплата % от монетизации канала.';
    const res = detectVacancyRisks(text);
    expect(res.isRisky).toBe(true);
    expect(res.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('detects scam deposit request', () => {
    const text = 'Срочно требуется видеомонтажер. Требуется страховой депозит 2000р перед началом.';
    const res = detectVacancyRisks(text);
    expect(res.isRisky).toBe(true);
    expect(res.reasons.some((r: string) => r.includes('скам'))).toBe(true);
  });

  it('returns not risky for standard well-paid vacancy', () => {
    const text = 'Ищем монтажера на YouTube. Оплата 5000 рублей за ролик. Монтаж в Premiere Pro.';
    const res = detectVacancyRisks(text, { min: 5000, max: 5000, currency: 'RUB', unit: 'per_video' });
    expect(res.isRisky).toBe(false);
    expect(res.reasons.length).toBe(0);
  });
});
