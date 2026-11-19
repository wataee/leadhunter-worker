import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectTextLanguage,
  needsRussianTranslation,
  splitTextChunks,
  translateFreeNeural,
} from '../shared/translate.js';

describe('Free neural translation & language detection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects English, Kazakh, German, French, Spanish, Polish, and Russian accurately', () => {
    expect(detectTextLanguage('Looking for a Premiere Pro YouTube video editor, $500/mo.')).toBe('en');
    expect(detectTextLanguage('Бейнемонтажер іздейміз, Алматы. Жалақы 300 000 теңге.')).toBe('kk');
    expect(detectTextLanguage('Wir suchen einen Videoeditor für unseren YouTube-Kanal mit Erfahrung.')).toBe('de');
    expect(detectTextLanguage('Nous recherchons un monteur vidéo freelance pour nos Reels.')).toBe('fr');
    expect(detectTextLanguage('Buscamos editor de vídeo con experiencia en After Effects.')).toBe('es');
    expect(detectTextLanguage('Szukamy montażysty wideo do stałej współpracy zdalnej.')).toBe('pl');
    expect(detectTextLanguage('Ищем монтажёра для длинных выпусков, 150 000 тенге Алматы')).toBe('ru');
  });

  it('flags non-Russian ads as needing Russian translation', () => {
    expect(needsRussianTranslation('Hiring short-form editor for TikTok $40/clip')).toBe(true);
    expect(needsRussianTranslation('Мобилограф қажет, Алматы қаласы')).toBe(true);
    expect(needsRussianTranslation('Требуется видеомонтажер в Алматы на постоянку')).toBe(false);
  });

  it('splits long text into chunks without losing content', () => {
    const line = 'Looking for a remote YouTube video editor with Premiere Pro experience.';
    const longText = Array.from({ length: 40 }, () => line).join('\n');
    const chunks = splitTextChunks(longText, 500);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(500);
    }
  });

  it('translates via Google GTX primary endpoint when available', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([[['Ищем видеомонтажёра для YouTube.', 'Looking for a YouTube video editor.', null, null]], null, 'en']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await translateFreeNeural('Looking for a YouTube video editor.', 'ru', 'en');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.provider).toBe('google-gtx');
    expect(res.translatedText).toBe('Ищем видеомонтажёра для YouTube.');
    expect(res.detectedSourceLang).toBe('en');
  });

  it('falls back seamlessly to MyMemory when Google GTX fails', async () => {
    const mockFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            responseStatus: 200,
            responseData: { translatedText: 'Нужен монтажер Reels за $50.' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const res = await translateFreeNeural('Need a Reels editor for $50.', 'ru', 'en');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res.provider).toBe('mymemory-free');
    expect(res.translatedText).toBe('Нужен монтажер Reels за $50.');
  });

  it('skips network translation when source text is already Russian', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await translateFreeNeural('Требуется монтаж ролика на YouTube', 'ru', 'auto');
    expect(spy).not.toHaveBeenCalled();
    expect(res.provider).toBe('native');
    expect(res.translatedText).toBe('Требуется монтаж ролика на YouTube');
  });
});
