export interface VacancyMatchResult {
  isMatch: boolean;
  matched: string[];
  reason?: string;
}

export declare function escapeRegex(str: string): string;
export declare function buildWordBoundaryRegex(phrase: string): RegExp;
export declare function normalizeText(text: string): string;
export declare function computeTextHash(str: string): string;
export declare function cleanChatId(chatId: string | number): string;
export declare function buildLeadId(chatId: string | number, messageId: string | number): string;
export declare function buildPostUrl(
  chat: { username?: string | null; id?: string | number; chatId?: string | number } | string,
  messageId: string | number
): string;
export declare function matchesVacancy(text: string): VacancyMatchResult;
