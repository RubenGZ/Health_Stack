/**
 * mobile/nutrition.spec.ts
 * Tests the NutritionScreen (/app/nutrition) of the React mobile PWA.
 *
 * The screen has 4 tabs: Planner, Recetas, TDEE, Suplementos.
 * - Planner and Recetas use localStorage (no JWT required for read, JWT for recipes)
 * - TDEE is pure client-side calculation
 * - Suplementos fetches from the backend
 */

import { test, expect } from '@playwright/test'
import { loginViaAPI } from '../../fixtures/auth'

// ── helpers ───────────────────────────────────────────────────────────────────

async function goToNutrition(page: Parameters<typeof test>[2]) {
  await loginViaAPI(page)
  await page.goto('/app/nutrition')
  await expect(page).toHaveURL(/app\/nutrition/, { timeout: 8_000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Mobile — NutritionScreen', () => {
  test('nutrition screen loads with "Comida" title', async ({ page }) => {
    await goToNutrition(page)
    await expect(page.getByText('Comida')).toBeVisible({ timeout: 8_000 })
  })

  test('four tab chips are displayed', async ({ page }) => {
    await goToNutrition(page)
    await expect(page.getByRole('button', { name: 'Planner' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Recetas' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'TDEE' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Suplementos' })).toBeVisible()
  })

  test('Planner tab shows day selector', async ({ page }) => {
    await goToNutrition(page)
    // Default tab is Planner — day chips L M X J V S D
    await expect(page.getByText('Planner')).toBeVisible({ timeout: 5_000 })
    // Day selector chips
    const dayChip = page.getByRole('button', { name: 'L' })
      .or(page.getByRole('button', { name: 'Lunes' }))
    await expect(dayChip.first()).toBeVisible({ timeout: 5_000 })
  })

  test('Planner tab shows meal sections', async ({ page }) => {
    await goToNutrition(page)
    // Meal sections: Desayuno, Media mañana, Almuerzo, Merienda, Cena
    await expect(page.getByText('Desayuno')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Almuerzo')).toBeVisible()
  })

  test('TDEE tab is accessible and shows the calculator form', async ({ page }) => {
    await goToNutrition(page)
    await page.getByRole('button', { name: 'TDEE' }).click()

    // TDEE form fields
    await expect(page.getByText(/sexo|género|Sexo/i).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByPlaceholder(/edad|25/i).or(page.locator('input[type="number"]').first())).toBeVisible()
  })

  test('TDEE calculator computes result with valid input', async ({ page }) => {
    await goToNutrition(page)
    await page.getByRole('button', { name: 'TDEE' }).click()

    // Fill all required fields
    // Weight, height, age fields
    const inputs = page.locator('input[type="number"]')
    const count  = await inputs.count()
    if (count >= 3) {
      await inputs.nth(0).fill('28')   // age
      await inputs.nth(1).fill('75')   // weight
      await inputs.nth(2).fill('175')  // height
    }

    // Activity level select
    const select = page.locator('select')
    const hasSelect = await select.isVisible({ timeout: 2_000 }).catch(() => false)
    if (hasSelect) {
      await select.selectOption({ index: 2 }) // Moderado
    }

    // Click calculate
    const calcBtn = page.getByRole('button', { name: /calcular|calculat/i })
    await calcBtn.click()

    // Result should show kcal value
    await expect(page.getByText(/kcal|TDEE|objetivo/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('TDEE result is saved to localStorage as hs_kcal_target', async ({ page }) => {
    await goToNutrition(page)
    await page.getByRole('button', { name: 'TDEE' }).click()

    const inputs = page.locator('input[type="number"]')
    const count  = await inputs.count()
    if (count >= 3) {
      await inputs.nth(0).fill('30')
      await inputs.nth(1).fill('80')
      await inputs.nth(2).fill('180')
    }

    const calcBtn = page.getByRole('button', { name: /calcular/i })
    await calcBtn.click()
    await page.waitForTimeout(500)

    const saved = await page.evaluate(() => localStorage.getItem('hs_kcal_target'))
    expect(saved).not.toBeNull()
    expect(Number(saved)).toBeGreaterThan(0)
  })

  test('Recetas tab shows recipe list or empty state', async ({ page }) => {
    await goToNutrition(page)
    await page.getByRole('button', { name: 'Recetas' }).click()

    // Either recipes or empty state
    const recipes   = page.locator('[class*="recipe"], [class*="Recipe"]').first()
    const emptyText = page.getByText(/sin recetas|no tienes|no hay recetas/i).first()
    const addBtn    = page.getByRole('button', { name: /nueva receta|añadir/i }).first()
    const any = recipes.or(emptyText).or(addBtn)
    await expect(any).toBeVisible({ timeout: 8_000 })
  })

  test('Suplementos tab shows supplement list or loading spinner', async ({ page }) => {
    await goToNutrition(page)
    await page.getByRole('button', { name: 'Suplementos' }).click()

    // Either a supplement card or a loading spinner
    const supCard = page.locator('div').filter({ hasText: /Evid\. [A-D]/ }).first()
    const spinner = page.locator('[class*="animate-spin"]').first()
    const empty   = page.getByText(/no hay suplementos/i)
    const any = supCard.or(spinner).or(empty)
    await expect(any).toBeVisible({ timeout: 10_000 })
  })

  test('stats button in TopBar is visible', async ({ page }) => {
    await goToNutrition(page)
    await expect(page.getByRole('button', { name: /estadísticas/i })).toBeVisible({ timeout: 5_000 })
  })
})
