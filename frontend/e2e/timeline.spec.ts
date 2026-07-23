import { test, expect } from '@playwright/test'

test('timeline page loads with event count', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/events · R v Nguyen/)).toBeVisible({ timeout: 10000 })
})

test('category filter chips are present', async ({ page }) => {
  await page.goto('/')
  for (const cat of ['All', 'Court', 'Police', 'Verdict']) {
    await expect(page.getByRole('button', { name: new RegExp(cat, 'i') }).first()).toBeVisible()
  }
})

test('category filter narrows visible events', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-testid="timeline-row"]')

  const allCount = await page.locator('[data-testid="timeline-row"]').count()

  await page.getByRole('button', { name: /^Court/i }).first().click()
  await page.waitForTimeout(300)

  const courtCount = await page.locator('[data-testid="timeline-row"]').count()
  expect(courtCount).toBeLessThan(allCount)
})

test('clicking an event row opens detail dialog', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-testid="timeline-row"]')
  await page.locator('[data-testid="timeline-row"]').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('detail dialog closes on dismiss', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-testid="timeline-row"]')
  await page.locator('[data-testid="timeline-row"]').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
