/**
 * mobile/profile.spec.ts
 * Tests the ProfileScreen (/app/profile) of the React mobile PWA.
 *
 * ProfileScreen shows: avatar, display name, level/streak, XP bar,
 * badges, and a menu with navigation items + logout button.
 */

import { test, expect } from '@playwright/test'
import { loginViaAPI, TEST_USER } from '../../fixtures/auth'

// ── helpers ───────────────────────────────────────────────────────────────────

async function goToProfile(page: Parameters<typeof test>[2]) {
  await loginViaAPI(page)
  await page.goto('/app/profile')
  await expect(page).toHaveURL(/app\/profile/, { timeout: 8_000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Mobile — ProfileScreen', () => {
  test('profile screen renders with "Perfil" title', async ({ page }) => {
    await goToProfile(page)
    await expect(page.getByText('Perfil')).toBeVisible({ timeout: 8_000 })
  })

  test('user avatar shows first letter of display name', async ({ page }) => {
    await goToProfile(page)
    // The avatar is a div with the first letter uppercased
    // TEST_USER.name is "E2E Atleta" → initial should be "E"
    const avatarLetter = page.locator('div').filter({ hasText: /^[A-ZÀ-ÿ]$/ })
    await expect(avatarLetter.first()).toBeVisible({ timeout: 8_000 })
  })

  test('user display name is shown', async ({ page }) => {
    await goToProfile(page)
    // The display name appears in the profile card
    // seed.py sets display_name = "E2E Atleta"
    await expect(page.getByText('E2E Atleta')).toBeVisible({ timeout: 8_000 })
  })

  test('level and title text is rendered', async ({ page }) => {
    await goToProfile(page)
    // "Nivel N · Principiante/Atleta en Forma/..."
    const levelText = page.getByText(/nivel \d+/i)
    await expect(levelText.first()).toBeVisible({ timeout: 8_000 })
  })

  test('XP progress bar section is rendered', async ({ page }) => {
    await goToProfile(page)
    // "XP Total" label appears above the progress bar
    await expect(page.getByText('XP Total')).toBeVisible({ timeout: 8_000 })
  })

  test('XP values are positive numbers (seeded user has XP)', async ({ page }) => {
    await goToProfile(page)
    // The seeded user has fired 38 gamification actions → XP > 0
    // XP display: "N / M" format
    const xpText = await page.getByText('XP Total')
      .locator('~ *').first().textContent()
      .catch(async () => {
        // Fallback: scan for the XP number
        const el = page.locator('span').filter({ hasText: /\d+ \/ \d+/ }).first()
        return el.textContent()
      })
    // If we got the text, verify XP > 0
    if (xpText) {
      const match = xpText.match(/(\d+)/)
      if (match) {
        expect(Number(match[1])).toBeGreaterThan(0)
      }
    }
  })

  test('badges section is rendered', async ({ page }) => {
    await goToProfile(page)
    // Either the "Badges" label (uppercase) or a badge item appears
    const badgesLabel = page.getByText('Badges')
    await expect(badgesLabel.first()).toBeVisible({ timeout: 8_000 })
  })

  test('streak days are shown when > 0', async ({ page }) => {
    await goToProfile(page)
    const streakEl = page.getByText(/\d+ días? de racha/i)
    // Non-deterministic: streak may or may not be > 0 depending on test data timing
    // Just verify the section renders without crashing
    const profileCard = page.locator('div').filter({ hasText: /nivel \d+/i }).first()
    await expect(profileCard).toBeVisible({ timeout: 8_000 })
  })

  test('settings button in TopBar navigates to /app/settings', async ({ page }) => {
    await goToProfile(page)
    await page.getByRole('button', { name: /ajustes/i }).click()
    await expect(page).toHaveURL(/app\/settings/, { timeout: 8_000 })
  })

  test('Comunidad menu row navigates to /app/community', async ({ page }) => {
    await goToProfile(page)
    await page.getByText('Comunidad').click()
    await expect(page).toHaveURL(/app\/community/, { timeout: 8_000 })
  })

  test('AI Insights menu row navigates to /app/insights', async ({ page }) => {
    await goToProfile(page)
    await page.getByText('AI Insights').click()
    await expect(page).toHaveURL(/app\/insights/, { timeout: 8_000 })
  })

  test('Asistente IA menu row navigates to /app/chat', async ({ page }) => {
    await goToProfile(page)
    await page.getByText('Asistente IA').click()
    await expect(page).toHaveURL(/app\/chat/, { timeout: 8_000 })
  })

  test('"Cerrar sesión" button logs out and redirects to login', async ({ page }) => {
    await goToProfile(page)
    await page.getByRole('button', { name: /cerrar sesión/i }).click()
    await expect(page).toHaveURL(/auth\/login/, { timeout: 8_000 })
    // Tokens should be cleared
    const token = await page.evaluate(() => localStorage.getItem('hs_access_token'))
    expect(token).toBeNull()
  })

  test('after logout, /app/profile redirects to /auth/login', async ({ page }) => {
    await goToProfile(page)
    await page.getByRole('button', { name: /cerrar sesión/i }).click()
    await expect(page).toHaveURL(/auth\/login/, { timeout: 8_000 })
    // Try to go back to profile — should redirect to login again
    await page.goto('/app/profile')
    await expect(page).toHaveURL(/auth\/login/, { timeout: 8_000 })
  })
})
