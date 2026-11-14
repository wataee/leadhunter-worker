import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BudgetBadge, formatBudgetDisplay } from '../components/BudgetBadge';

describe('BudgetBadge Component and formatBudgetDisplay', () => {
  it('formats range budget with rubles', () => {
    const formatted = formatBudgetDisplay({
      min: 50000,
      max: 80000,
      currency: 'RUB',
      unit: 'per_video',
    });
    expect(formatted).toBe('50\u00A0000 - 80\u00A0000 ₽ / ролик');
  });

  it('formats single amount in USD per month', () => {
    const formatted = formatBudgetDisplay({
      min: 1500,
      max: 1500,
      currency: 'USD',
      unit: 'per_month',
    });
    expect(formatted).toBe('1\u00A0500 $ / мес');
  });

  it('formats negotiable correctly', () => {
    const formatted = formatBudgetDisplay({
      min: null,
      max: null,
      currency: 'NEGOTIABLE',
    });
    expect(formatted).toBe('По договорённости');
  });

  it('renders BudgetBadge into document', () => {
    render(
      <BudgetBadge
        budget={{
          min: 3000,
          max: 5000,
          currency: 'RUB',
          unit: 'per_video',
        }}
      />
    );

    const badge = screen.getByTestId('budget-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('3\u00A0000 - 5\u00A0000 ₽ / ролик');
  });

  it('renders nothing when budget is null', () => {
    const { container } = render(<BudgetBadge budget={null} />);
    expect(container.firstChild).toBeNull();
  });
});
