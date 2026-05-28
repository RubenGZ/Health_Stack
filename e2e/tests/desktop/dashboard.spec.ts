/**
 * desktop/dashboard.spec.ts
 * Tests the dashboard section and global navigation of the vanilla-JS desktop SPA.
 *
 * The desktop SPA uses localStorage for weight/gamification state.
 * These tests verify the DOM structure, quick-action navigation, and stat cards.
 */

import { test, expect } from '@playwright/test'
import { loginViaDesktopUI } from '../../fixtures/auth'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Navigate to a section via sidebar. */
async function goToSection(page: Parameters<typeof test>[2], section: string) {
  await page.click(`[data-section="${section}"]`)
  await page.waitForSelector(`#section-${section}.active`, { timeout: 5_000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Desktop — Dashboard', () => {
  test('dashboard section is visible on load', async ({ page }) => {
    await page.goto('/')
    // Default section is dashboard
    await expect(page.locator('#section-dashboard')).toBeVisible()
    // Sidebar must be present
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  test('stat cards are rendered with placeholder values', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#stat-weight')).toBeVisible()
    await expect(page.locator('#stat-bmi')).toBeVisible()
    await expect(page.locator('#stat-tdee')).toBeVisible()
    await expect(page.locator('#stat-records')).toBeVisible()
  })

  test('streak badge is visible on dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#streak-badge')).toBeVisible()
  })

  test('greeting text is rendered', async ({ page }) => {
    await page.goto('/')
    const greeting = page.locator('#dashboard-greeting')
    await expect(greeting).toBeVisible()
    // Should contain a greeting phrase
    const text = await greeting.textContent()
    expect(text).toMatch(/buenos|buenas/i)
  })

  test('quick-action "Registrar peso" navigates to peso section', async ({ page }) => {
    await page.goto('/')
    await page.click('.quick-card[data-section="peso"]')
    await expect(page.locator('#section-peso')).toHaveClass(/active/, { timeout: 5_000 })
  })

  test('quick-action "Calcular macros" navigates to nutricion section', async ({ page }) => {
    await page.goto('/')
    await page.click('.quick-card[data-section="nutricion"]')
    await expect(page.locator('#section-nutricion')).toHaveClass(/active/, { timeout: 5_000 })
  })

  test('quick-action "Ver ejercicios" navigates to ejercicios section', async ({ page }) => {
    await page.goto('/')
    await page.click('.quick-card[data-section="ejercicios"]')
    await expect(page.locator('#section-ejercicios')).toHaveClass(/active/, { timeout: 5_000 })
  })

  test('quick-action "Planner semanal" navigates to planner section', async ({ page }) => {
    await page.goto('/')
    await page.click('.quick-card[data-section="planner"]')
    await expect(page.locator('#section-planner')).toHaveClass(/active/, { timeout: 5_000 })
  })

  test('sidebar nav items navigate between sections', async ({ page }) => {
    await page.goto('/')
    await goToSection(page, 'gamificacion')
    await expect(page.locator('#section-gamificacion')).toBeVisible()

    await goToSection(page, 'comunidad')
    await expect(page.locator('#section-comunidad')).toBeVisible()

    // Navigate back to dashboard
    await goToSection(page, 'dashboard')
    await expect(page.locator('#section-dashboard')).toBeVisible()
  })

  test('URL hash updates when navigating sections', async ({ page }) => {
    await page.goto('/')
    await goToSection(page, 'peso')
    expect(page.url()).toContain('#peso')

    await goToSection(page, 'nutricion')
    expect(page.url()).toContain('#nutricion')
  })

  test('user chip shows default name when logged out', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#user-name')).toHaveText('Atleta')
    await expect(page.locator('#user-level')).toContainText('Novato')
  })

  test('after login, user chip shows authenticated user name', async ({ page }) => {
    await loginViaDesktopUI(page)
    const name = page.locator('#user-name')
    await expect(name).not.toHaveText('Atleta', { timeout: 10_000 })
  })
})
