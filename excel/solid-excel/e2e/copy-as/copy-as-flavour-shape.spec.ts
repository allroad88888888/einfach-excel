import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { grantClipboard, withEnglishLocale } from '../helpers'

/**
 * Copy-as flavour shape assertions beyond the smoke coverage:
 * HTML entity escaping, GFM pipe escaping, empty-cell slot preservation,
 * and the structural tr/td shape of the emitted table.
 *
 * Encoder contracts under test (spreadsheet-ui-core/src/copy-as/):
 *   - html-encoder: `&`→`&amp;`, `<`→`&lt;`, `"`→`&quot;`, `'`→`&#39;`.
 *   - markdown-encoder: `\` doubled, `|`→`\|`; row 1 of the rect is the
 *     GFM header, one ` --- ` per column after it.
 *   - plain text: `\t` between columns, `\n` between rows, empty cells
 *     emit empty fields.
 *
 * Scratch cells live in columns J..L, clear of the A1:F9 seed.
 */

const WAVE5_GRID = '[data-testid="wave5-grid"]'

function cell(page: Page, addr: string) {
  return page.locator(`${WAVE5_GRID} td.cell[data-cell-addr="${addr}"]`)
}

async function gotoWave5(page: Page, context: BrowserContext) {
  await grantClipboard(context)
  await context.addInitScript(() => {
    ;(window as unknown as { __EINFACH_E2E__: boolean }).__EINFACH_E2E__ = true
  })
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

async function navigateViaNameBox(page: Page, addr: string) {
  const input = page.getByTestId('name-box-input')
  await input.click()
  await input.fill(addr)
  await input.press('Enter')
  await expect(cell(page, addr)).toBeVisible()
}

async function typeIntoCellAddr(page: Page, addr: string, value: string) {
  await cell(page, addr).dblclick()
  const input = cell(page, addr).locator('.cell-input')
  await expect(input).toBeVisible()
  await input.fill(value)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
}

async function pressCtrlShiftC(page: Page) {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+Shift+c`)
}

type CopyAsResult = { html: string; plainText: string; markdown: string }

async function copyAsAndReadMirror(page: Page): Promise<CopyAsResult> {
  // Clear any previous mirror so each copy waits for its own result.
  await page.evaluate(() => {
    ;(window as unknown as { __einfach_lastCopyAs__?: unknown }).__einfach_lastCopyAs__ = null
  })
  await pressCtrlShiftC(page)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as { __einfach_lastCopyAs__?: CopyAsResult | null }
          return w.__einfach_lastCopyAs__ ?? null
        }),
      { timeout: 5_000 },
    )
    .not.toBeNull()
  return (await page.evaluate(() => {
    const w = window as unknown as { __einfach_lastCopyAs__?: CopyAsResult | null }
    return w.__einfach_lastCopyAs__!
  })) as CopyAsResult
}

test.describe('copy-as flavour shape — escaping, empty cells, structure', () => {
  test('HTML flavour escapes markup-significant characters in cell text', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await navigateViaNameBox(page, 'J1')
    await typeIntoCellAddr(page, 'J1', '<b>&"quoted"')

    await cell(page, 'J1').click()
    const mirror = await copyAsAndReadMirror(page)

    expect(mirror.html).toContain('&lt;b&gt;&amp;&quot;quoted&quot;')
    // The raw tag must never survive into the markup.
    expect(mirror.html).not.toContain('<b>')
    // Plain text carries the characters verbatim — no escaping there.
    expect(mirror.plainText).toBe('<b>&"quoted"')
  })

  test('markdown flavour escapes pipes and keeps the GFM grid intact', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await navigateViaNameBox(page, 'J3')
    await typeIntoCellAddr(page, 'J3', 'a|b')
    await typeIntoCellAddr(page, 'K3', 'c')

    await cell(page, 'J3').click()
    await cell(page, 'K3').click({ modifiers: ['Shift'] })
    const mirror = await copyAsAndReadMirror(page)

    const lines = mirror.markdown.split('\n')
    // 1-row rect → header + separator, nothing else.
    expect(lines.length).toBe(2)
    // The literal pipe is escaped so the table still parses as two columns.
    expect(lines[0]).toMatch(/\|\s*a\\\|b\s*\|\s*c\s*\|/)
    expect(lines[1]).toMatch(/\|\s*---\s*\|\s*---\s*\|/)
    // Plain text keeps the raw pipe.
    expect(mirror.plainText).toBe('a|b\tc')
  })

  test('empty cells keep their slot in all three flavours', async ({ page, context }) => {
    await gotoWave5(page, context)
    await navigateViaNameBox(page, 'J5')
    await typeIntoCellAddr(page, 'J5', 'x')
    // K5 deliberately left empty.
    await typeIntoCellAddr(page, 'J6', 'y')
    await typeIntoCellAddr(page, 'K6', 'z')

    await cell(page, 'J5').click()
    await cell(page, 'K6').click({ modifiers: ['Shift'] })
    const mirror = await copyAsAndReadMirror(page)

    // TSV: the empty K5 emits an empty field, not a dropped column.
    expect(mirror.plainText).toBe('x\t\ny\tz')
    // GFM: header row keeps an empty second column.
    const lines = mirror.markdown.split('\n')
    expect(lines[0]).toMatch(/\|\s*x\s*\|\s*\|/)
    expect(lines[2]).toMatch(/\|\s*y\s*\|\s*z\s*\|/)
    // HTML: all four td slots exist even though one is empty.
    expect(mirror.html.match(/<td/g)?.length).toBe(4)
  })

  test('HTML flavour structural shape for a 2x2: one table, two tr, four td', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)

    await cell(page, 'B2').click()
    await cell(page, 'C3').click({ modifiers: ['Shift'] })
    const mirror = await copyAsAndReadMirror(page)

    expect(mirror.html.startsWith('<table')).toBe(true)
    expect(mirror.html.endsWith('</table>')).toBe(true)
    expect(mirror.html.match(/<tr/g)?.length).toBe(2)
    expect(mirror.html.match(/<td/g)?.length).toBe(4)
    // Content sanity: the four seed values all made it into the cells.
    for (const value of ['120', '180', '80', '160']) {
      expect(mirror.html).toContain(`>${value}</td>`)
    }
  })
})
