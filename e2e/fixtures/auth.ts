/**
 * auth.ts — Shared auth helpers for E2E tests.
 *
 * loginViaAPI()  — injects tokens into localStorage without going through the
 *                  login UI.  Use this in every test that isn't testing auth
 *                  itself.  Fast (~200 ms vs ~2 s for UI login).
 *
 * loginViaUI()   — fills the visible login form.  Used only in auth.spec.ts.
 *
 * logoutViaUI()  — clicks user-chip → "Cerrar sesión".
 *                  Works for both desktop and mobile.
 */

import { type Page } from '@playwright/test'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export const TEST_USER = {
  email:    process.env.TEST_USER_EMAIL    ?? 'e2e_user@healthstack.test',
  password: process.env.TEST_USER_PASSWORD ?? 'E2eTest!2026',
  name:     process.env.TEST_USER_NAME     ?? 'E2E Atleta',
}

export const TEST_ADMIN = {
  email:    process.env.TEST_ADMIN_EMAIL    ?? 'e2e_admin@healthstack.test',
  password: process.env.TEST_ADMIN_PASSWORD ?? 'E2eAdmin!2026',
  name:     process.env.TEST_ADMIN_NAME     ?? 'E2E Admin',
}

/** Obtain a fresh JWT pair from the backend, inject into page localStorage. */
export async function loginViaAPI(
  page: Page,
  user: { email: string; password: string } = TEST_USER,
): Promise<void> {
  const resp = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: user.email, password: user.password },
  })

  if (!resp.ok()) {
    throw new Error(
      `loginViaAPI failed: ${resp.status()} — ${await resp.text()}`,
    )
  }

  const { access_token, refresh_token } = (await resp.json()) as {
    access_token: string
    refresh_token: string
  }

  // Navigate to root first so we have the right origin for localStorage.
  // The redirect from / → /mobile/ ensures the SPA is loaded at its real base.
  await page.goto('/')
  // Wait for the SPA to actually load (the redirect + React hydration)
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(
    ([at, rt]) => {
      localStorage.setItem('hs_access_token',  at)
      localStorage.setItem('hs_refresh_token', rt)
      // Mark onboarding as complete so login routes directly to /app/today
      localStorage.setItem('hs_onboarded', 'true')
    },
    [access_token, refresh_token],
  )

  // Navigate explicitly to the app (not reload at root, which React Router
  // maps to /auth/login via the catch-all route)
  await page.goto('/app/today')
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Desktop: open auth modal, fill login tab, submit.
 * Wait until the user chip shows the user's name.
 */
export async function loginViaDesktopUI(
  page: Page,
  user: { email: string; password: string } = TEST_USER,
): Promise<void> {
  await page.goto('/')
  await page.click('#user-chip')
  // Modal might already be on login tab; make sure
  await page.click('.auth-tab[data-tab="login"]')
  await page.fill('#auth-login-email', user.email)
  await page.fill('#auth-login-pwd',   user.password)
  await page.click('#auth-login-btn')
  // Wait until chip shows the user's name (login succeeds)
  await page.waitForSelector('#user-name:not(:empty)', { timeout: 10_000 })
}

/**
 * Mobile: navigate to login screen, fill form, submit.
 * Sets hs_onboarded first so the post-login redirect goes to /app/today.
 * Wait for redirect to /app/today or /auth/onboarding.
 */
export async function loginViaMobileUI(
  page: Page,
  user: { email: string; password: string } = TEST_USER,
): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  // Mark onboarding complete so login goes straight to /app/today
  await page.evaluate(() => localStorage.setItem('hs_onboarded', 'true'))
  await page.fill('input[type="email"]',    user.email)
  await page.fill('input[type="password"]', user.password)
  await page.click('button[type="submit"]')
  // Accept either /app/today (normal) or /auth/onboarding (first time)
  await page.waitForURL('**/(app/today|auth/onboarding)', { timeout: 10_000 })
    .catch(() => page.waitForURL('**/app/today', { timeout: 5_000 }))
}

/** Desktop logout: click user chip → "Cerrar sesión" */
export async function logoutViaDesktopUI(page: Page): Promise<void> {
  await page.click('#user-chip')
  await page.click('#do-logout-btn')
}
