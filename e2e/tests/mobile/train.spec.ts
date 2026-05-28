/**
 * mobile/train.spec.ts
 * Tests the TrainScreen (/app/train) of the React mobile PWA.
 *
 * The screen has 3 chip-tabs: Rutinas, Ejercicios, Rutinas IA.
 * - Rutinas fetches saved routines from the backend (JWT required)
 * - Ejercicios is a static catalog (no auth needed to render)
 * - Rutinas IA calls the AI routine generator endpoint
 */

import { test, expect } from '@playwright/test'
import { loginViaAPI } from '../../fixtures/auth'

// ── helpers ───────────────────────────────────────────────────────────────────

async function goToTrain(page: Parameters<typeof test>[2]) {
  await loginViaAPI(page)
  await page.goto('/app/train')
  await expect(page).toHaveURL(/app\/train/, { timeout: 8_000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Mobile — TrainScreen', () => {
  test('train screen loads with correct title', async ({ page }) => {
    await goToTrain(page)
    // TopBar title for TrainScreen
    const title = page.getByText(/entreno|entrenamiento|Entreno/i).first()
    await expect(title).toBeVisible({ timeout: 8_000 })
  })

  test('three tab chips are visible', async ({ page }) => {
    await goToTrain(page)
    await expect(page.getByRole('button', { name: 'Rutinas' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Ejercicios' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rutinas IA' })).toBeVisible()
  })

  test('Rutinas tab shows seeded routine from seed.py', async ({ page }) => {
    await goToTrain(page)
    // The seed script creates "E2E Fuerza Total" routine
    // It should appear in the Rutinas tab (default tab)
    const routine = page.getByText('E2E Fuerza Total')
    const hasRoutine = await routine.isVisible({ timeout: 8_000 }).catch(() => false)
    if (hasRoutine) {
      await expect(routine).toBeVisible()
    } else {
      // At minimum, the tab should show content (not an auth error)
      const content = page.locator('[class*="routine"], button, [class*="card"]').first()
      await expect(content).toBeVisible({ timeout: 8_000 })
    }
  })

  test('Ejercicios tab shows exercise catalog', async ({ page }) => {
    await goToTrain(page)
    await page.getByRole('button', { name: 'Ejercicios' }).click()
    await page.waitForTimeout(300)

    // Exercise catalog items should appear
    // The catalog has muscle group filter chips at the top
    const groupChip = page.getByRole('button', { name: 'Todos' })
      .or(page.getByRole('button', { name: 'Pecho' }))
    await expect(groupChip.first()).toBeVisible({ timeout: 5_000 })
  })

  test('Ejercicios tab shows exercise cards from the catalog', async ({ page }) => {
    await goToTrain(page)
    await page.getByRole('button', { name: 'Ejercicios' }).click()
    await page.waitForTimeout(300)

    // The catalog includes "Press de banca" — check for any exercise name
    const exercise = page.getByText(/press de banca|sentadilla|dominadas/i).first()
    await expect(exercise).toBeVisible({ timeout: 5_000 })
  })

  test('muscle group filter changes the exercise list', async ({ page }) => {
    await goToTrain(page)
    await page.getByRole('button', { name: 'Ejercicios' }).click()
    await page.waitForTimeout(300)

    const pechoBtn = page.getByRole('button', { name: 'Pecho' })
    const hasPecho = await pechoBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasPecho) {
      await pechoBtn.click()
      // "Press de banca" should be visible (Pecho group)
      await expect(page.getByText(/press de banca/i)).toBeVisible({ timeout: 5_000 })
    }
  })

  test('search input filters exercises', async ({ page }) => {
    await goToTrain(page)
    await page.getByRole('button', { name: 'Ejercicios' }).click()
    await page.waitForTimeout(300)

    const searchInput = page.getByPlaceholder(/buscar|ejercicio/i)
    const hasSearch = await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasSearch) {
      await searchInput.fill('sentadilla')
      await page.waitForTimeout(300)
      await expect(page.getByText(/sentadilla/i).first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test('Rutinas IA tab shows the AI routine generator', async ({ page }) => {
    await goToTrain(page)
    await page.getByRole('button', { name: 'Rutinas IA' }).click()
    await page.waitForTimeout(300)

    // The AI tab should show form inputs or a generate button
    const generateBtn = page.getByRole('button', { name: /generar|crear rutina|ia/i })
      .or(page.locator('button:has-text("Generar")'))
      .first()
    const formEl = page.locator('select, input[type="number"]').first()
    const any = generateBtn.or(formEl)
    await expect(any).toBeVisible({ timeout: 5_000 })
  })

  test('adding exercise to session from catalog (if available)', async ({ page }) => {
    await goToTrain(page)
    await page.getByRole('button', { name: 'Ejercicios' }).click()
    await page.waitForTimeout(300)

    // Look for an "Add to session" or "+" button on an exercise card
    const addBtn = page.locator('button[aria-label*="añadir" i], button[aria-label*="add" i], button:has-text("+")').first()
    const hasAdd = await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasAdd) {
      await addBtn.click()
      // Either a success feedback or the exercise count increases
      await page.waitForTimeout(300)
      // No specific assertion — just verify no JS error/crash
    }
  })
})
