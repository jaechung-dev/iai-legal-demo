import { test, expect } from '@playwright/test'

test('search page loads with mode toggle', async ({ page }) => {
  await page.goto('/search')
  await expect(page.getByRole('button', { name: /search/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /ask/i }).first()).toBeVisible()
})

test('mode toggles between Search and Ask', async ({ page }) => {
  await page.goto('/search')
  const searchInput = page.getByPlaceholder(/search nsw legislation/i)
  await expect(searchInput).toBeVisible()

  await page.getByRole('button', { name: /💬 ask/i }).click()
  await expect(page.getByPlaceholder(/ask a legal question/i)).toBeVisible()
})

test('source dropdown has all options', async ({ page }) => {
  await page.goto('/search')
  const select = page.locator('select')
  await expect(select).toBeVisible()
  await expect(select.locator('option[value="legislation"]')).toHaveCount(1)
  await expect(select.locator('option[value="caselaw"]')).toHaveCount(1)
  await expect(select.locator('option[value="both"]')).toHaveCount(1)
})
