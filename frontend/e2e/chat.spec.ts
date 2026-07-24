import { test, expect } from '@playwright/test'

test('chat page renders heading and suggested questions', async ({ page }) => {
  await page.goto('/chat')
  await expect(page.getByText('Ask about NSW law')).toBeVisible()
  await expect(page.getByText('What is a committal hearing?')).toBeVisible()
  await expect(page.getByText('What does bail mean?')).toBeVisible()
})

test('chat input is present and accepts text', async ({ page }) => {
  await page.goto('/chat')
  const input = page.getByPlaceholder(/ask a question about nsw law/i)
  await expect(input).toBeVisible()
  await input.fill('What is bail?')
  await expect(input).toHaveValue('What is bail?')
})

test('pressing Enter with input adds user message to thread', async ({ page }) => {
  await page.goto('/chat')
  const input = page.getByPlaceholder(/ask a question about nsw law/i)
  await input.fill('What is bail?')
  await input.press('Enter')
  await expect(page.getByText('What is bail?')).toBeVisible()
})

test('sources panel is visible', async ({ page }) => {
  await page.goto('/chat')
  await expect(page.getByText('SOURCES')).toBeVisible()
})
