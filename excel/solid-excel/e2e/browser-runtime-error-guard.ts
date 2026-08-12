import { expect, type ConsoleMessage, type Page } from '@playwright/test'

const DEFAULT_CONSOLE_ALLOWLIST = [
  /^\[vite\]/, // HMR / connection chatter
  /^\[lazy-demo\] /, // DemoCrossSheetChain probe
  /Download the React DevTools/, // dev tools nag
]

type GuardedPage = Page & {
  __einfachConsoleErrors?: string[]
  __einfachPageErrors?: string[]
}

/**
 * Record unallowlisted console errors until `expectNoConsoleErrors` checks
 * them. Specs use this explicit assertion style so an expected UI error can
 * opt out locally without weakening other scenarios.
 */
export function guardConsoleErrors(page: Page, extraAllow: RegExp[] = []): () => void {
  const allow = [...DEFAULT_CONSOLE_ALLOWLIST, ...extraAllow]
  const errors: string[] = []
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (allow.some((re) => re.test(text))) return
    errors.push(text)
  }
  page.on('console', handler)
  ;(page as GuardedPage).__einfachConsoleErrors = errors
  return () => page.off('console', handler)
}

/** Assert the matching console-error guard has not recorded a leak. */
export async function expectNoConsoleErrors(page: Page) {
  const errors = (page as GuardedPage).__einfachConsoleErrors ?? []
  expect(errors, `console.error leaked: ${errors.join('\n')}`).toEqual([])
}

/**
 * Record uncaught exceptions emitted by the page until
 * `expectNoPageErrors` checks them. This deliberately stays separate from
 * the console guard: browsers may emit either signal independently.
 */
export function guardPageErrors(page: Page): () => void {
  const errors: string[] = []
  const handler = (error: Error) => errors.push(error.message)
  page.on('pageerror', handler)
  ;(page as GuardedPage).__einfachPageErrors = errors
  return () => page.off('pageerror', handler)
}

/** Assert the matching uncaught-page-error guard has not recorded a leak. */
export async function expectNoPageErrors(page: Page) {
  const errors = (page as GuardedPage).__einfachPageErrors ?? []
  expect(errors, `uncaught page error leaked: ${errors.join('\n')}`).toEqual([])
}
