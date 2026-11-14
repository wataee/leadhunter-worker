import React from 'react';
import { Vacancy } from '../types';

export type BudgetResult = NonNullable<Vacancy['budget']>;

interface BudgetBadgeProps {
  budget: BudgetResult | null | undefined;
}

export function formatBudgetDisplay(budget: BudgetResult | null | undefined): string {
  if (!budget) return '';

  if (budget.currency === 'NEGOTIABLE') {
    const unitText = formatUnitText(budget.unit);
    return `По договорённости${unitText ? ` (${unitText})` : ''}`;
  }

  const currencySign =
    budget.currency === 'RUB'
      ? '₽'
      : budget.currency === 'USD'
      ? '$'
      : budget.currency === 'EUR'
      ? '€'
      : budget.currency === 'KZT'
      ? '₸'
      : budget.currency === 'UAH'
      ? '₴'
      : budget.currency;

  let amountStr = '';
  if (budget.min != null && budget.max != null) {
    if (budget.min === budget.max) {
      amountStr = `${budget.min.toLocaleString('ru-RU')} ${currencySign}`;
    } else {
      amountStr = `${budget.min.toLocaleString('ru-RU')} - ${budget.max.toLocaleString('ru-RU')} ${currencySign}`;
    }
  } else if (budget.min != null) {
    amountStr = `от ${budget.min.toLocaleString('ru-RU')} ${currencySign}`;
  } else if (budget.max != null) {
    amountStr = `до ${budget.max.toLocaleString('ru-RU')} ${currencySign}`;
  }

  const unitText = formatUnitText(budget.unit);
  return unitText ? `${amountStr} / ${unitText}` : amountStr;
}

function formatUnitText(unit?: string): string {
  switch (unit) {
    case 'per_video':
      return 'ролик';
    case 'per_month':
      return 'мес';
    case 'per_hour':
      return 'час';
    case 'per_minute':
      return 'мин';
    case 'project':
      return 'проект';
    default:
      return '';
  }
}

export const BudgetBadge: React.FC<BudgetBadgeProps> = ({ budget }) => {
  if (!budget) return null;

  const display = formatBudgetDisplay(budget);
  if (!display) return null;

  return (
    <span
      data-testid="budget-badge"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20"
    >
      <span>💰 {display}</span>
    </span>
  );
};
