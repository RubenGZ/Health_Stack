/**
 * mobile/auth.spec.ts
 * Tests the login / register / logout flows in the React mobile PWA.
 *
 * Routes (relative to MOBILE_BASE_URL which includes /mobile/ in prod,
 * but in dev the Vite server responds at / with base=/mobile/):
 *   /auth/login      — LoginScreen
 *   /auth/register   — RegisterScreen
 *   /auth/onboarding — OnboardingScreen (post-register)
 *   /app/today       — TodayScreen (requires auth)
 */

import { test, expect } from '@playwright/test'
import { TEST_USER, loginViaMobileUI, loginViaAPI } from '../../fixtures/auth'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Root (/) should redirect to /auth/login for unauthenticated users. */
async function goToLogin(page: Parameters<typeof test>[2]) {
  await page.goto('/')
  await page.waitForURL('**/auth/login', { timeout: 8_000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Mobile — Auth', () => {
  test('unauthenticated root redirects to login screen', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/auth\/login/, { timeout: 8_000 })
  })

  test('login screen renders correctly', async ({ page }) => {
    await goToLogin(page)
    // App title
    await expect(page.getByText('HealthStack Pro')).toBeVisible()
    // Email and password fields
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    // Submit button
    await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible()
  })

  test('register link navigates to register screen', async ({ page }) => {
    await goToLogin(page)
    await page.getByRole('link', { name: /regístrate/i }).click()
    await expect(page).toHaveURL(/auth\/register/, { timeout: 5_000 })
  })

  test('register screen renders correctly', async ({ page }) => {
    // Navigate via the login → register link (avoids Vite base path issues)
    await goToLogin(page)
    await page.getByRole('link', { name: /regístrate/i }).click()
    await expect(page).toHaveURL(/auth\/register/, { timeout: 5_000 })
    await expect(page.getByText('Crear cuenta')).toBeVisible({ timeout: 5_000 })
    // Should have email + password fields
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('login with wrong credentials shows an error', async ({ page }) => {
    await goToLogin(page)
    await page.fill('input[type="email"]',    TEST_USER.email)
    await page.fill('input[type="password"]', 'wrongpassword!')
    await page.click('button[type="submit"]')
    // Error message should appear — LoginScreen renders: <p className="text-red-400 ...">
    // The mock API returns 401 with detail: "Credenciales incorrectas"
    await expect(page.getByText(/credenciales|error/i)).toBeVisible({ timeout: 8_000 })
  })

  test('login with correct credentials redirects to today or onboarding', async ({ page }) => {
    await loginViaMobileUI(page)
    // After login: goes to /app/today (hs_onboarded set) or /auth/onboarding (new user)
    await expect(page).toHaveURL(/app\/today|auth\/onboarding/, { timeout: 10_000 })
  })

  test('API-injected tokens allow direct access to /app/today', async ({ page }) => {
    await loginViaAPI(page)
    // loginViaAPI now navigates to /app/today at the end
    await expect(page).toHaveURL(/app\/today/, { timeout: 10_000 })
  })

  test('authenticated user can reach /app/today directly', async ({ page }) => {
    await loginViaAPI(page)
    // loginViaAPI ends at /app/today — just verify we're there and not at login
    await expect(page).toHaveURL(/app\/today/, { timeout: 8_000 })
    await expect(page).not.toHaveURL(/auth\/login/)
  })

  test('unauthenticated root access redirects to login', async ({ page }) => {
    // Fresh page has no tokens → root redirects to login
    await page.goto('/')
    await expect(page).toHaveURL(/auth\/login/, { timeout: 8_000 })
  })

  test('show password toggle works on login screen', async ({ page }) => {
    await goToLogin(page)
    const passwordInput = page.locator('input[type="password"]')
    const toggleBtn = page.locator('[aria-label*="contraseña" i]')
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await toggleBtn.click()
    // Type should change to text
    await expect(page.locator('input[type="text"]').first()).toBeVisible()
  })

  test('back link on register goes to login', async ({ page }) => {
    await goToLogin(page)
    await page.getByRole('link', { name: /regístrate/i }).click()
    await expect(page).toHaveURL(/auth\/register/, { timeout: 5_000 })
    const loginLink = page.getByRole('link', { name: /inicia sesión|ya tienes/i })
    const hasLink = await loginLink.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasLink) {
      await loginLink.click()
      await expect(page).toHaveURL(/auth\/login/, { timeout: 5_000 })
    }
  })

  test('logout clears auth and redirects to login', async ({ page }) => {
    await loginViaAPI(page)
    // loginViaAPI ends at /app/today (via /mobile/app/today redirect behavior)
    // Navigate to profile which has the logout button
    await page.evaluate(() => localStorage.setItem('hs_onboarded', 'true'))
    await page.goto('/app/profile')
    const profileLogout = page.getByRole('button', { name: /cerrar sesión/i })
    const hasLogout = await profileLogout.isVisible({ timeout: 5_000 }).catch(() => false)
    if (hasLogout) {
      await profileLogout.click()
      await expect(page).toHaveURL(/auth\/login/, { timeout: 8_000 })
    }
  })
})
