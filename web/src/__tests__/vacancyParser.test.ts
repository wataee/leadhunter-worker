import { describe, it, expect } from 'vitest';
import { parseStructuredVacancy } from '../shared/vacancyParser';

describe('Vacancy Parser (Structured extraction & Closed detector)', () => {
  it('detects closed vacancy status', () => {
    const res1 = parseStructuredVacancy('Ищу монтажера на ютуб. ВАКАНСИЯ ЗАКРЫТА, спасибо!');
    expect(res1.isClosed).toBe(true);

    const res2 = parseStructuredVacancy('Нужен рилсмейкер срочно. Стоп прием заявок.');
    expect(res2.isClosed).toBe(true);

    const res3 = parseStructuredVacancy('Монтируем подкаст, пишите в лс @editor_job');
    expect(res3.isClosed).toBe(false);
  });

  it('detects software stack', () => {
    const res = parseStructuredVacancy('Требуется знание Premiere Pro и After Effects, базовый DaVinci');
    expect(res.software).toContain('Premiere Pro');
    expect(res.software).toContain('After Effects');
    expect(res.software).toContain('DaVinci Resolve');
  });

  it('detects duration and footage status', () => {
    const res = parseStructuredVacancy('Ролик 10-15 мин для YouTube. Исходники есть, ТЗ готово.');
    expect(res.duration).toBe('10-15 мин');
    expect(res.footage).toBe('ready');
  });

  it('detects urgency and deadlines', () => {
    const res = parseStructuredVacancy('СРОЧНО нужен монтаж рилс до вечера');
    expect(res.deadline).toContain('Срочно');
  });
});
