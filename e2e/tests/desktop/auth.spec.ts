/**
 * desktop/auth.spec.ts
 * Tests the login / register / logout flows in the vanilla-JS desktop SPA.
 *
 * Selectors are pinned to real HTML ids from frontend/js/auth.js and
 * frontend/index.html — update them if the DOM changes.
 */

import { test, expect } from '@playwright/test'
import { TEST_USER, loginViaDesktopUI, logoutViaDesktopUI } from '../../fixtures/auth'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Open the auth modal by clicking the user chip. */
async function openAuthModal(page: Parameters<typeof test>[2]) {
  await page.goto('/')
  await page.click('#user-chip')
  await page.waitForSelector('#auth-modal', { state: 'visible' })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Desktop — Auth', () => {
  test('page loads and shows the desktop SPA', async ({ page }) => {
    await page.goto('/')
    // Sidebar navigation must be present
    await expect(page.locator('.sidebar')).toBeVisible()
    // Dashboard section is the default active section
    await expect(page.locator('#section-dashboard')).toBeVisible()
  })

  test('clicking user-chip opens the auth modal', async ({ page }) => {
    await openAuthModal(page)
    await expect(page.locator('#auth-login-form')).toBeVisible()
    await expect(page.locator('.auth-tab[data-tab="login"]')).toHaveClass(/auth-tab--active/)
  })

  test('can switch to the register tab', async ({ page }) => {
    await openAuthModal(page)
    await page.click('.auth-tab[data-tab="register"]')
    await expect(page.locator('#auth-register-form')).toBeVisible()
    await expect(page.locator('#auth-login-form')).not.toBeVisible()
  })

  test('login with wrong password shows an error', async ({ page }) => {
    await openAuthModal(page)
    await page.fill('#auth-login-email', TEST_USER.email)
    await page.fill('#auth-login-pwd',   'wrongpassword!')
    await page.click('#auth-login-btn')
    await expect(page.locator('#auth-login-error')).toBeVisible({ timeout: 8_000 })
  })

  test('login with correct credentials succeeds', async ({ page }) => {
    await loginViaDesktopUI(page)
    // User chip now shows the user's name (not "Atleta")
    const chip = page.locator('#user-name')
    await expect(chip).not.toHaveText('Atleta', { timeout: 8_000 })
    // Dashboard is still visible and authenticated
    await expect(page.locator('#section-dashboard')).toBeVisible()
  })

  test('logout clears the session', async ({ page }) => {
    await loginViaDesktopUI(page)
    await logoutViaDesktopUI(page)
    // User chip resets to default
    await expect(page.locator('#user-name')).toHaveText('Atleta', { timeout: 5_000 })
  })

  test('register form validates required fields', async ({ page }) => {
    await openAuthModal(page)
    await page.click('.auth-tab[data-tab="register"]')
    // Try to submit without filling GDPR checkbox
    await page.fill('#auth-reg-email', 'incomplete@test.com')
    await page.fill('#auth-reg-pwd',   'Password1!')
    // Do NOT check GDPR
    await page.click('#auth-register-btn')
    // Should show error (GDPR consent required)
    await expect(page.locator('#auth-register-error')).toBeVisible({ timeout: 5_000 })
  })

  test('closing modal with Escape key works', async ({ page }) => {
    await openAuthModal(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('#auth-modal')).not.toBeVisible()
  })
})
