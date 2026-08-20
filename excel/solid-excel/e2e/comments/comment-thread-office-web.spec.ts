import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'
import { cell, expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

const COMMENT_THREAD_STYLE_URL = new URL(
  '../../../spreadsheet-ui-styles/features/comment-thread.css',
  import.meta.url,
)

async function openThread(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await cell(page, 'D4').click()
  await page.getByTestId('toolbar-btn-comment').click()
  await expect(page.getByTestId('wave5-comment-thread')).toBeVisible()
}

async function threadMetrics(page: Page, theme: 'light' | 'dark') {
  return page.getByTestId('wave5-comment-thread').evaluate((thread, nextTheme) => {
    const host = thread.closest<HTMLElement>('.vnext-demo, .demo-page')!
    if (nextTheme === 'dark') host.dataset.spreadsheetTheme = 'dark'
    else delete host.dataset.spreadsheetTheme

    const resolveColor = (token: string) => {
      const sample = document.createElement('span')
      sample.style.color = `var(${token})`
      thread.append(sample)
      const color = getComputedStyle(sample).color
      sample.remove()
      return color
    }
    const query = (selector: string) => thread.querySelector<HTMLElement>(selector)!
    const header = query('.comment-thread-header')
    const textarea = query('[data-testid="comment-thread-textarea"]')
    const close = query('[data-testid="comment-close-button"]')
    const post = query('[data-testid="comment-post-button"]')
    textarea.focus()

    return {
      actionOrder: Array.from(thread.querySelectorAll('[data-testid]')).map((element) =>
        element.getAttribute('data-testid'),
      ),
      background: getComputedStyle(thread).backgroundColor,
      controlHeights: [close, post].map((element) => element.getBoundingClientRect().height),
      focusColor: getComputedStyle(textarea).outlineColor,
      headerHeight: header.getBoundingClientRect().height,
      primaryBackground: getComputedStyle(post).backgroundColor,
      tokens: {
        blue: resolveColor('--office-blue'),
        primary: resolveColor('--dialog-primary-bg'),
        surface: resolveColor('--bg-surface'),
      },
      transform: getComputedStyle(thread).transform,
    }
  }, theme)
}

test.describe('Comment thread Office web surface', () => {
  test.beforeEach(({ page }) => guardConsoleErrors(page))

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('is token-only, anchored, and keeps the compact thread hierarchy in both themes', async ({
    page,
  }) => {
    const source = (await readFile(COMMENT_THREAD_STYLE_URL, 'utf8')).replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])

    await openThread(page)
    const thread = page.getByTestId('wave5-comment-thread')
    await expect(thread).toHaveAttribute('data-anchor-state', 'cell')
    await expect(thread).toHaveAttribute('data-thread-kind', 'new')

    const light = await threadMetrics(page, 'light')
    const dark = await threadMetrics(page, 'dark')
    for (const metrics of [light, dark]) {
      expect(metrics.background).toBe(metrics.tokens.surface)
      expect(metrics.controlHeights).toEqual([28, 28])
      expect(metrics.focusColor).toBe(metrics.tokens.blue)
      expect(metrics.headerHeight).toBe(40)
      expect(metrics.primaryBackground).toBe(metrics.tokens.primary)
      expect(metrics.transform).toBe('none')
      expect(metrics.actionOrder).toEqual([
        'comment-thread-cell',
        'dialog-close-x',
        'comment-thread-textarea',
        'comment-close-button',
        'comment-post-button',
      ])
    }
    expect(dark.background).not.toBe(light.background)
    expect(dark.focusColor).not.toBe(light.focusColor)
  })
})
