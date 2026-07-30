import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { grantClipboard, withEnglishLocale } from '../helpers'

/**
 * Copy-as degradation matrix (copy-as-dispatch.ts::multiTierWrite).
 *
 *   tier 1 — ClipboardItem(html + plain + markdown)
 *   tier 2 — ClipboardItem(html + plain)
 *   tier 3 — navigator.clipboard.writeText(plain)
 *
 * This spec forces the ClipboardItem tiers to fail in two distinct ways
 * (constructor throws / constructor missing) and asserts the tier-3
 * writeText degrade, plus the total-failure contract (mirror untouched)
 * and the PNG path's publish-before-clipboard ordering.
 *
 * Assertions read `window.__einfach_lastCopyAs__`, the e2e mirror of
 * `lastCopyAsAtom` enabled by the `__EINFACH_E2E__` runtime flag.
 */

const WAVE5_GRID = '[data-testid="wave5-grid"]'

function cell(page: Page, addr: string) {
  return page.locator(`${WAVE5_GRID} td.cell[data-cell-addr="${addr}"]`)
}

async function enableE2EMirror(context: BrowserContext) {
  await context.addInitScript(() => {
    ;(window as unknown as { __EINFACH_E2E__: boolean }).__EINFACH_E2E__ = true
  })
}

/** Replace ClipboardItem with a constructor that always throws. */
async function breakClipboardItemConstructor(context: BrowserContext) {
  await context.addInitScript(() => {
    ;(window as unknown as { ClipboardItem: unknown }).ClipboardItem = function ClipboardItem() {
      throw new Error('forced-constructor-reject')
    }
  })
}

/** Remove ClipboardItem entirely (Firefox-without-images shape). */
async function removeClipboardItem(context: BrowserContext) {
  await context.addInitScript(() => {
    ;(window as unknown as { ClipboardItem: unknown }).ClipboardItem = undefined
  })
}

/** Spy on writeText; optionally force it to reject too. */
async function spyWriteText(context: BrowserContext, reject = false) {
  await context.addInitScript((forceReject) => {
    const w = window as unknown as { __einfach_writeTextCalls__?: string[] }
    w.__einfach_writeTextCalls__ = []
    const original = navigator.clipboard.writeText.bind(navigator.clipboard)
    navigator.clipboard.writeText = (text: string) => {
      w.__einfach_writeTextCalls__!.push(text)
      if (forceReject) return Promise.reject(new Error('forced-writeText-reject'))
      return original(text)
    }
  }, reject)
}

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

async function pressCtrlShift(page: Page, key: 'c' | 'p') {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+Shift+${key}`)
}

async function selectSeed2x2AndCopyAs(page: Page) {
  await cell(page, 'B2').click()
  await cell(page, 'C3').click({ modifiers: ['Shift'] })
  await pressCtrlShift(page, 'c')
}

type TextMirror = { html: string; plainText: string; markdown: string }

async function readTextMirror(page: Page): Promise<TextMirror | null> {
  return await page.evaluate(() => {
    const w = window as unknown as { __einfach_lastCopyAs__?: TextMirror | null }
    return w.__einfach_lastCopyAs__ ?? null
  })
}

async function readWriteTextCalls(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as { __einfach_writeTextCalls__?: string[] }
    return w.__einfach_writeTextCalls__ ?? []
  })
}

const SEED_TSV = '120\t180\n80\t160'

test.describe('copy-as degradation — ClipboardItem failures fall back to writeText', () => {
  test('ClipboardItem constructor throwing degrades to writeText with the TSV payload', async ({
    page,
    context,
  }) => {
    await grantClipboard(context)
    await enableE2EMirror(context)
    await breakClipboardItemConstructor(context)
    await spyWriteText(context)
    await gotoWave5(page)

    await selectSeed2x2AndCopyAs(page)

    // Tier 1 and tier 2 both die in the constructor; tier 3 must succeed
    // and still publish the FULL triple to the mirror.
    await expect.poll(() => readTextMirror(page), { timeout: 5_000 }).not.toBeNull()
    const mirror = await readTextMirror(page)
    expect(mirror!.plainText).toBe(SEED_TSV)
    expect(mirror!.html).toContain('<table')
    expect(mirror!.markdown).toContain('---')

    const calls = await readWriteTextCalls(page)
    expect(calls).toContain(SEED_TSV)
  })

  test('missing ClipboardItem (undefined) routes straight to the writeText tier', async ({
    page,
    context,
  }) => {
    await grantClipboard(context)
    await enableE2EMirror(context)
    await removeClipboardItem(context)
    await spyWriteText(context)
    await gotoWave5(page)

    await selectSeed2x2AndCopyAs(page)

    await expect.poll(() => readTextMirror(page), { timeout: 5_000 }).not.toBeNull()
    const mirror = await readTextMirror(page)
    expect(mirror!.plainText).toBe(SEED_TSV)
    expect(mirror!.html).toContain('<table')
    expect(mirror!.markdown).toContain('|')

    const calls = await readWriteTextCalls(page)
    expect(calls).toContain(SEED_TSV)
  })

  test('total clipboard failure leaves the mirror untouched (no stale publish)', async ({
    page,
    context,
  }) => {
    await grantClipboard(context)
    await enableE2EMirror(context)
    await breakClipboardItemConstructor(context)
    await spyWriteText(context, /* reject */ true)
    await gotoWave5(page)

    await selectSeed2x2AndCopyAs(page)

    // writeText WAS attempted (the dispatch reached tier 3)…
    await expect.poll(() => readWriteTextCalls(page), { timeout: 5_000 }).toContain(SEED_TSV)
    // …but every tier failed, so the mirror must stay at its initial null —
    // `lastCopyAsAtom` is only written on success.
    await page.waitForTimeout(500)
    expect(await readTextMirror(page)).toBeNull()
  })

  test('PNG snapshot still publishes when ClipboardItem is unavailable', async ({
    page,
    context,
  }) => {
    await grantClipboard(context)
    await enableE2EMirror(context)
    await removeClipboardItem(context)
    await gotoWave5(page)

    await cell(page, 'A1').click()
    await cell(page, 'B2').click({ modifiers: ['Shift'] })
    await pressCtrlShift(page, 'p')

    // The image path publishes its snapshot BEFORE attempting the system
    // clipboard, so a missing ClipboardItem must not suppress the mirror.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              __einfach_lastCopyAs__?: { kind?: string; blob?: Blob } | null
            }
            const m = w.__einfach_lastCopyAs__
            if (!m || m.kind !== 'image' || !m.blob) return null
            return { kind: m.kind, size: m.blob.size }
          }),
        { timeout: 5_000 },
      )
      .toMatchObject({ kind: 'image' })
    const size = await page.evaluate(() => {
      const w = window as unknown as { __einfach_lastCopyAs__?: { blob?: Blob } | null }
      return w.__einfach_lastCopyAs__?.blob?.size ?? 0
    })
    expect(size).toBeGreaterThan(0)
  })
})
