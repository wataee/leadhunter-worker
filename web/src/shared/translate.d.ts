export type DetectedLanguageCode = 'ru' | 'en' | 'kk' | 'de' | 'fr' | 'es' | 'pl' | 'it' | 'other';

export declare const LANG_LABELS: Record<DetectedLanguageCode, string>;

export declare function detectTextLanguage(text: string): DetectedLanguageCode;
export declare function needsRussianTranslation(text: string): boolean;
export declare function splitTextChunks(text: string, maxLen?: number): string[];

export interface NeuralTranslationResult {
  translatedText: string;
  provider: string;
  detectedSourceLang: string;
}

export declare function translateFreeNeural(
  text: string,
  targetLang?: 'ru' | 'en' | 'kk' | string,
  sourceLang?: string
): Promise<NeuralTranslationResult>;
