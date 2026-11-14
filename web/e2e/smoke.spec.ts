import { test, expect } from '@playwright/test';

test.describe('LeadHunter E2E Smoke Tests', () => {
  test('homepage loads and navigates to vacancies', async ({ page }) => {
    await page.goto('/');

    // Check main title or logo is visible
    await expect(page.locator('text=LeadHunter').first()).toBeVisible();

    // Navigate to /vacancies
    await page.click('a[href="/vacancies"]');
    await expect(page).toHaveURL(/.*\/vacancies/);

    // Verify vacancies header
    await expect(page.locator('text=Лента вакансий').first()).toBeVisible();

    // Verify filter actions are present
    await expect(page.locator('button:has-text("Обновить")')).toBeVisible();
  });

  test('shortcuts modal opens on question mark or click', async ({ page }) => {
    await page.goto('/');

    // Open shortcuts modal via topbar/sidebar button if present
    const shortcutButton = page.locator('button[aria-label="Горячие клавиши"]');
    if (await shortcutButton.count() > 0) {
      await shortcutButton.first().click();
      await expect(page.locator('text=Горячие клавиши')).toBeVisible();
    }
  });
});
