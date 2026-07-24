import { test, expect } from '@playwright/test'

test('register page renders form and Google button', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible()
  await expect(page.getByText('Continue with Google')).toBeVisible()
  await expect(page.getByPlaceholder(/jane smith/i)).toBeVisible()
  await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible()
  await expect(page.getByPlaceholder(/min. 8 characters/i)).toBeVisible()
})

test('register page has link back to login', async ({ page }) => {
  await page.goto('/register')
  const link = page.getByRole('link', { name: /sign in/i })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', '/login/')
})

test('login page has link to register', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: /create a free account/i })).toBeVisible()
})

test('login page shows Google OAuth button', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Continue with Google')).toBeVisible()
})

test('register shows error when passwords do not match', async ({ page }) => {
  await page.goto('/register')
  await page.getByPlaceholder(/jane smith/i).fill('Test User')
  await page.getByPlaceholder(/you@example.com/i).fill('test@example.com')
  await page.getByPlaceholder(/min. 8 characters/i).fill('password123')
  await page.getByPlaceholder(/repeat your password/i).fill('different123')
  await page.getByRole('button', { name: /create account/i }).click()
  await expect(page.getByText(/passwords do not match/i)).toBeVisible()
})

test('password strength indicator appears while typing', async ({ page }) => {
  await page.goto('/register')
  const pwInput = page.getByPlaceholder(/min. 8 characters/i)
  await pwInput.fill('abc')
  await expect(page.getByText(/weak password/i)).toBeVisible()
  await pwInput.fill('abcdefgh')
  await expect(page.getByText(/fair password/i)).toBeVisible()
})

test('register shows verify email screen on success', async ({ page }) => {
  await page.goto('/register')
  const ts = Date.now()
  await page.getByPlaceholder(/jane smith/i).fill('Playwright User')
  await page.getByPlaceholder(/you@example.com/i).fill(`pw-test-${ts}@example.com`)
  await page.getByPlaceholder(/min. 8 characters/i).fill('SecurePass99!')
  await page.getByPlaceholder(/repeat your password/i).fill('SecurePass99!')
  await page.getByRole('button', { name: /create account/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/verification link/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /continue to app/i })).toBeVisible()
})
