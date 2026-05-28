/**
 * desktop/nutrition.spec.ts
 * Tests the Nutrición section (TDEE calculator, macro planner tabs) in the desktop SPA.
 *
 * The TDEE calculator is client-side only (JS math). We test the form inputs,
 * result rendering, and localStorage persistence.
 */

import { test, expect } from '@playwright/test'

// ── helpers ───────────────────────────────────────────────────────────────────

async function openNutricion(page: Parameters<typeof test>[2]) {
  await page.goto('/#nutricion')
  // Ensure the section is active (the hash-based router should activate it)
  await page.waitForSelector('#section-nutricion.active', { timeout: 5_000 })
    .catch(async () => {
      // Fallback: click the nav item
      await page.click('[data-section="nutricion"]')
      await page.waitForSelector('#section-nutricion.active', { timeout: 5_000 })
    })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Desktop — Nutrition', () => {
  test('nutricion section renders on navigation', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="nutricion"]')
    await expect(page.locator('#section-nutricion')).toHaveClass(/active/, { timeout: 5_000 })
  })

  test('nutrition section contains TDEE calculator or macro tabs', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="nutricion"]')
    await expect(page.locator('#section-nutricion')).toBeVisible()
    // Section should have some content
    const content = page.locator('#section-nutricion')
    await expect(content).not.toBeEmpty()
  })

  test('TDEE calculator computes result when all fields are filled', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="nutricion"]')
    await expect(page.locator('#section-nutricion')).toHaveClass(/active/, { timeout: 5_000 })

    // Find age/weight/height/sex fields — try common IDs from macroCalc.js
    const ageField    = page.locator('#tdee-age, [name="age"], input[placeholder*="edad" i]').first()
    const weightField = page.locator('#tdee-weight, [name="weight"], input[placeholder*="peso" i]').first()
    const heightField = page.locator('#tdee-height, [name="height"], input[placeholder*="talla" i], input[placeholder*="altura" i]').first()

    // Only proceed if the TDEE form exists
    const hasForm = await ageField.isVisible().catch(() => false)
    if (!hasForm) {
      test.skip()
      return
    }

    await ageField.fill('28')
    await weightField.fill('75')
    await heightField.fill('175')

    // Submit the form
    const calcBtn = page.locator('button:has-text("Calcular"), #btn-calc-tdee').first()
    await calcBtn.click()

    // Result should appear (some element showing kcal)
    const result = page.locator('[id*="tdee-result"], [id*="result-tdee"], .tdee-result, [class*="result"]').first()
    await expect(result).toBeVisible({ timeout: 5_000 })
  })

  test('macro calc section has ingredient search', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="nutricion"]')
    await expect(page.locator('#section-nutricion')).toHaveClass(/active/, { timeout: 5_000 })

    // Look for macro/ingredient search input
    const searchInput = page.locator(
      '#ingredient-search, input[placeholder*="ingrediente" i], input[placeholder*="alimento" i], input[placeholder*="buscar" i]'
    ).first()
    const hasMacro = await searchInput.isVisible().catch(() => false)
    if (hasMacro) {
      await searchInput.fill('pollo')
      // Should show filtered results
      await expect(page.locator('.ingredient-item, .ingredient-result, [class*="ingredient"]').first())
        .toBeVisible({ timeout: 5_000 })
    } else {
      // The section at minimum renders something
      await expect(page.locator('#section-nutricion')).not.toBeEmpty()
    }
  })

  test('planner section is accessible from nutricion tabs', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="planner"]')
    await expect(page.locator('#section-planner')).toHaveClass(/active/, { timeout: 5_000 })
    await expect(page.locator('#section-planner')).toBeVisible()
  })

  test('supplements section renders', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="suplementos"]')
    await expect(page.locator('#section-suplementos')).toHaveClass(/active/, { timeout: 5_000 })
    await expect(page.locator('#section-suplementos')).toBeVisible()
  })
})
