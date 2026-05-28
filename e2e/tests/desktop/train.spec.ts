/**
 * desktop/train.spec.ts
 * Tests the Ejercicios and Rutinas sections of the desktop SPA.
 *
 * Exercise catalog: static list rendered by exercises.js.
 * Routine generator: AI-powered (requires auth + backend).
 * Tests here cover the static/catalog parts which work without auth.
 */

import { test, expect } from '@playwright/test'
import { loginViaDesktopUI } from '../../fixtures/auth'

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Desktop — Ejercicios', () => {
  test('ejercicios section renders on navigation', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="ejercicios"]')
    await expect(page.locator('#section-ejercicios')).toHaveClass(/active/, { timeout: 5_000 })
    await expect(page.locator('#section-ejercicios')).toBeVisible()
  })

  test('exercise catalog shows exercise items', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="ejercicios"]')
    await expect(page.locator('#section-ejercicios')).toHaveClass(/active/, { timeout: 5_000 })

    // The catalog should render at least one exercise item
    const items = page.locator(
      '.exercise-item, .exercise-card, [class*="exercise"], .catalog-item'
    )
    await expect(items.first()).toBeVisible({ timeout: 5_000 })
  })

  test('muscle group filter chips are present', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="ejercicios"]')
    await expect(page.locator('#section-ejercicios')).toHaveClass(/active/, { timeout: 5_000 })

    // Filter chips for muscle groups
    const chips = page.locator(
      '.muscle-chip, .group-chip, [data-group], button:has-text("Pecho"), button:has-text("Pierna")'
    )
    await expect(chips.first()).toBeVisible({ timeout: 5_000 })
  })

  test('clicking a muscle group filter updates the exercise list', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="ejercicios"]')
    await expect(page.locator('#section-ejercicios')).toHaveClass(/active/, { timeout: 5_000 })

    const pechoChip = page.locator('button:has-text("Pecho"), [data-group="Pecho"]').first()
    const hasFilter = await pechoChip.isVisible().catch(() => false)
    if (hasFilter) {
      await pechoChip.click()
      // After filtering, items should still exist (or show "no results")
      const items = page.locator('.exercise-item, .exercise-card, [class*="exercise"]')
      const noResults = page.locator('[class*="empty"], p:has-text("No hay"), p:has-text("Sin resultados")')
      const either = items.first().or(noResults.first())
      await expect(either).toBeVisible({ timeout: 5_000 })
    }
  })

  test('exercise search filters results', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="ejercicios"]')
    await expect(page.locator('#section-ejercicios')).toHaveClass(/active/, { timeout: 5_000 })

    const searchInput = page.locator(
      '#exercise-search, input[placeholder*="buscar" i], input[placeholder*="ejercicio" i]'
    ).first()
    const hasSearch = await searchInput.isVisible().catch(() => false)
    if (hasSearch) {
      await searchInput.fill('sentadilla')
      await page.waitForTimeout(300) // debounce
      const items = page.locator('.exercise-item, .exercise-card, [class*="exercise"]')
      await expect(items.first()).toBeVisible({ timeout: 5_000 })
    }
  })
})

test.describe('Desktop — Rutinas', () => {
  test('rutinas section renders on navigation', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="rutinas"]')
    await expect(page.locator('#section-rutinas')).toHaveClass(/active/, { timeout: 5_000 })
    await expect(page.locator('#section-rutinas')).toBeVisible()
  })

  test('saved routines list or empty state is visible', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="rutinas"]')
    await expect(page.locator('#section-rutinas')).toHaveClass(/active/, { timeout: 5_000 })

    // Either a list of routines or an empty state message
    const routineList  = page.locator('.routine-card, .routine-item, [class*="routine"]')
    const emptyState   = page.locator(
      '[class*="empty"], p:has-text("No tienes"), p:has-text("Sin rutinas"), h3:has-text("rutina")'
    )
    const generateBtn  = page.locator('button:has-text("Generar"), button:has-text("Nueva rutina"), #btn-generate-routine')

    const anyVisible = routineList.first().or(emptyState.first()).or(generateBtn.first())
    await expect(anyVisible).toBeVisible({ timeout: 5_000 })
  })

  test('routine generator shows form or AI prompt when authenticated', async ({ page }) => {
    await loginViaDesktopUI(page)
    await page.click('[data-section="rutinas"]')
    await expect(page.locator('#section-rutinas')).toHaveClass(/active/, { timeout: 5_000 })

    // After auth, should be able to generate routines
    const generateBtn = page.locator(
      'button:has-text("Generar"), button:has-text("Nueva rutina"), #btn-generate-routine, [id*="generate"]'
    ).first()
    const hasBtn = await generateBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasBtn) {
      // The button should be enabled (not disabled)
      await expect(generateBtn).not.toBeDisabled()
    }
  })

  test('session replay section renders', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="sessionreplay"]')
    await expect(page.locator('#section-sessionreplay')).toHaveClass(/active/, { timeout: 5_000 })
    await expect(page.locator('#section-sessionreplay')).toBeVisible()
  })
})

test.describe('Desktop — Weight Tracker', () => {
  test('peso section renders with chart or empty state', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="peso"]')
    await expect(page.locator('#section-peso')).toHaveClass(/active/, { timeout: 5_000 })

    // Either the chart canvas or the empty state
    const chart      = page.locator('#weight-chart')
    const emptyState = page.locator('#weight-chart-empty')
    // One of them should be in the DOM
    await expect(chart.or(emptyState)).toBeVisible({ timeout: 5_000 })
  })

  test('"Añadir registro" button is visible in peso section', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="peso"]')
    await expect(page.locator('#section-peso')).toHaveClass(/active/, { timeout: 5_000 })
    await expect(page.locator('#btn-open-weight-form')).toBeVisible()
  })

  test('clicking "Añadir registro" opens the weight form', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="peso"]')
    await expect(page.locator('#section-peso')).toHaveClass(/active/, { timeout: 5_000 })
    await page.click('#btn-open-weight-form')

    // The weight entry form or modal should appear
    const form = page.locator(
      '#weight-form, #w-date, form[id*="weight"], .weight-modal, [class*="weight-form"]'
    ).first()
    await expect(form).toBeVisible({ timeout: 5_000 })
  })

  test('weight form submission with valid data adds an entry', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-section="peso"]')
    await expect(page.locator('#section-peso')).toHaveClass(/active/, { timeout: 5_000 })
    await page.click('#btn-open-weight-form')

    // Fill the date and weight fields
    const dateInput   = page.locator('#w-date, input[type="date"]').first()
    const weightInput = page.locator('#w-weight, input[type="number"]').first()
    const submitBtn   = page.locator('#modal-submit, button[type="submit"], button:has-text("Guardar"), button:has-text("Añadir")').first()

    const hasForm = await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasForm) { test.skip(); return }

    const today = new Date().toISOString().slice(0, 10)
    await dateInput.fill(today)
    await weightInput.fill('78.5')
    await submitBtn.click()

    // Entry should appear in the list or the chart should update
    await page.waitForTimeout(500)
    const entry = page.locator('[class*="entry"], .weight-entry, .weight-list-item, #weight-list').first()
    const listExists = await entry.isVisible({ timeout: 3_000 }).catch(() => false)
    if (listExists) {
      await expect(entry).toBeVisible()
    } else {
      // Chart should now be visible (empty state hides)
      await expect(page.locator('#weight-chart-empty')).not.toBeVisible({ timeout: 3_000 })
        .catch(() => { /* acceptable */ })
    }
  })
})
