export type Currency = 'RUB' | 'USD' | 'EUR' | 'KZT' | 'NEGOTIABLE';

export interface BudgetResult {
  min: number | null;
  max: number | null;
  currency: Currency;
}

export declare function parseBudget(text: string): BudgetResult | null;
