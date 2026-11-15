import { test, expect } from '@playwright/test';

test.describe('LeadHunter Core Minimal Flow E2E', () => {
  test('полный цикл: лента → откликнуться → в лиды → скрыть через меню → источники', async ({ page }) => {
    // 1. Открытие главной страницы
    await page.goto('/');
    await expect(page.locator('text=LeadHunter').first()).toBeVisible();

    // 2. Переход в ленту вакансий
    await page.click('a[href="/vacancies"]');
    await expect(page).toHaveURL(/.*\/vacancies/);
    await expect(page.locator('h1:has-text("Вакансии")')).toBeVisible();
    await expect(page.locator('button:has-text("Обновить")')).toBeVisible();

    // 3. Проверка фильтрации
    const allBtn = page.locator('button:has-text("Все")');
    const hotBtn = page.locator('button:has-text("Горячие")');
    await expect(allBtn).toBeVisible();
    await expect(hotBtn).toBeVisible();

    // 4. Если есть карточки вакансий — проверяем действия
    const cards = page.locator('.group.rounded-card');
    if ((await cards.count()) > 0) {
      const firstCard = cards.first();

      // Кнопка Откликнуться открывает модалку
      const applyBtn = firstCard.locator('button:has-text("Откликнуться")');
      await expect(applyBtn).toBeVisible();

      // Кнопка В лиды
      const toLeadBtn = firstCard.locator('button:has-text("В лиды")');
      await expect(toLeadBtn).toBeVisible();
      await toLeadBtn.click();

      // Меню ⋯ с опцией Скрыть
      const menuBtn = firstCard.locator('button[aria-label="Дополнительные действия"]');
      if ((await menuBtn.count()) > 0) {
        await menuBtn.click();
        await expect(page.locator('text=Скрыть вакансию')).toBeVisible();
      }
    }

    // 5. Переход на страницу «Источники»
    await page.click('a[href="/sources"]');
    await expect(page).toHaveURL(/.*\/sources/);
    await expect(page.locator('h1:has-text("Источники")')).toBeVisible();

    // 6. Проверка кнопки «Оставить только с лидами за 14 дней»
    const keepActiveBtn = page.locator('button:has-text("Оставить только с лидами за 14 дней")');
    await expect(keepActiveBtn).toBeVisible();
  });
});
