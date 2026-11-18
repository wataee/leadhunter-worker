export type Currency = 'RUB' | 'USD' | 'EUR' | 'GBP' | 'KZT' | 'UAH' | 'NEGOTIABLE';

export type BudgetUnit = 'per_video' | 'per_month' | 'per_hour' | 'per_minute' | 'project';

export interface BudgetResult {
  min: number | null;
  max: number | null;
  currency: Currency;
  unit?: BudgetUnit;
}

export declare function parseBudget(text: string): BudgetResult | null;
export declare function detectBudgetUnit(text: string): BudgetUnit | undefined;
