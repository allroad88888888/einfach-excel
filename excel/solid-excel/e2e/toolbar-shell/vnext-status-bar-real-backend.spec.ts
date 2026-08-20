import { expect, test, type Page } from '@playwright/test'

import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  selectSheet,
} from '../helpers'

type DebugCell = {
  display: string
  formula: string
}

type DebugSheet = {
  idx: number
  name: string
}

type DebugClient = {
  sheetList(): Promise<DebugSheet[]>
  readCells(cells: Array<{ sheet: number; addr: string }>): Promise<DebugCell[]>
}

async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page, 'debug=1')
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (
            window as unknown as {
              __einfachWorkbookDebugClient?: DebugClient
            }
          ).__einfachWorkbookDebugClient?.sheetList === 'function',
      ),
    )
    .toBe(true)
}

async function readSheetList(page: Page) {
  return page.evaluate(async () => {
    const client = (window as unknown as { __einfachWorkbookDebugClient: DebugClient })
      .__einfachWorkbookDebugClient
    return client.sheetList()
  })
}

async function readCells(page: Page, sheet: number, addresses: string[]) {
  return page.evaluate(
    async ({ sheetIdx, addrs }) => {
      const client = (window as unknown as { __einfachWorkbookDebugClient: DebugClient })
        .__einfachWorkbookDebugClient
      const cells = await client.readCells(addrs.map((addr) => ({ sheet: sheetIdx, addr })))
      return cells.map(({ display, formula }) => ({ display, formula }))
    },
    { sheetIdx: sheet, addrs: addresses },
  )
}

async function commitCellInput(page: Page, address: string, input: string) {
  await cell(page, address).dblclick()
  const editor = cell(page, address).locator('.cell-input')
  await expect(editor).toBeVisible()
  await editor.fill(input)
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
}

async function selectRange(page: Page, start: string, end: string) {
  await cell(page, start).click()
  await cell(page, end).click({ modifiers: ['Shift'] })
}

async function expectAggregate(page: Page, key: string, value: string) {
  await expect(page.getByTestId(`status-aggregate-${key}-value`)).toHaveText(value)
}

test.describe('vNext status bar real-backend feasibility gate', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('visible edits and formulas round-trip through the canonical backend and aggregates', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    const sheets = await readSheetList(page)
    const sheet1 = sheets.find((sheet) => sheet.name === 'Sheet1')
    expect(sheet1, 'canonical worker metadata must expose Sheet1').toBeDefined()

    // Drive a literal write through the visible Grid; the debug port is
    // deliberately read-only evidence for the worker round-trip.
    await commitCellInput(page, 'B4', '20')
    await expect
      .poll(() => readCells(page, sheet1!.idx, ['B4', 'C4']))
      .toEqual([
        { display: '20', formula: '' },
        { display: 'source', formula: '' },
      ])

    await selectRange(page, 'B4', 'C4')
    await expect(page.getByTestId('status-selection')).toHaveText('B4:C4')
    await expectAggregate(page, 'sum', '20')
    await expectAggregate(page, 'average', '20')
    await expectAggregate(page, 'count', '2')
    await expect(page.getByTestId('status-aggregates')).toHaveAttribute('data-truncated', 'false')

    // A stable built-in formula proves aggregates consume computed display
    // values while canonical readback retains the formula source.
    await commitCellInput(page, 'A5', '5')
    await commitCellInput(page, 'B5', '=A5*2')
    await expect
      .poll(() => readCells(page, sheet1!.idx, ['A5', 'B5']))
      .toEqual([
        { display: '5', formula: '' },
        { display: '10', formula: '=A5*2' },
      ])
    await expect(cellDisplay(page, 'B5')).toHaveText('10')

    await selectRange(page, 'A5', 'B5')
    await expectAggregate(page, 'sum', '15')
    await expectAggregate(page, 'average', '7.5')
    await expectAggregate(page, 'count', '2')
    await expect(page.getByTestId('status-aggregates')).toHaveAttribute('data-truncated', 'false')
  })

  test('formatted numeric display preserves raw aggregate semantics', async ({ page }) => {
    // The TS worker ships no number-format transport, so the toolbar
    // mutation surface is fail-closed `blocked` there by design —
    // CANONICAL_OWNERSHIP §2 (TS worker = fail-closed dev fallback) and
    // §3 #19/#31 (number-format semantics verified against WASM only).
    test.skip(
      test.info().project.name === 'ts',
      'TS worker has no number-format transport; fail-closed blocked is the product stance (CANONICAL_OWNERSHIP §3 #19/#31)',
    )
    await gotoWorkerDemo(page)

    const sheets = await readSheetList(page)
    const sheet1 = sheets.find((sheet) => sheet.name === 'Sheet1')
    expect(sheet1, 'canonical worker metadata must expose Sheet1').toBeDefined()

    // The visible toolbar applies a display-only thousands format through the
    // real worker adapter. Canonical readback must keep the raw numeric value,
    // and status aggregates must not parse the formatted projection as truth.
    await commitCellInput(page, 'B4', '1234.5')
    await expect
      .poll(() => readCells(page, sheet1!.idx, ['B4']))
      .toEqual([{ display: '1234.5', formula: '' }])

    await cell(page, 'B4').click()
    await page.getByTestId('toolbar-btn-number-format').click()
    const numberFormatDropdown = page.getByTestId('number-format-dropdown')
    await expect(numberFormatDropdown).toBeVisible()
    await page.getByTestId('number-format-item-NumberThousands').click()
    await expect(numberFormatDropdown).toBeHidden()
    await expect(page.getByTestId('vnext-worker-toolbar')).toHaveAttribute(
      'data-toolbar-mutation-status',
      'ready',
    )
    await expect(page.getByTestId('vnext-worker-toolbar')).not.toHaveAttribute(
      'data-toolbar-mutation-error',
      /.+/,
    )
    await expect(cellDisplay(page, 'B4')).toHaveText('1,234.50')

    await expect
      .poll(() => readCells(page, sheet1!.idx, ['B4']))
      .toEqual([{ display: '1234.5', formula: '' }])
    await expectAggregate(page, 'sum', '1234.5')
    await expectAggregate(page, 'average', '1234.5')
    await expectAggregate(page, 'count', '1')
    await expect(page.getByTestId('status-aggregates')).toHaveAttribute('data-truncated', 'false')
  })

  test('aggregate configuration is reachable and reversible from visible product controls', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await selectRange(page, 'B4', 'C4')

    // 9622ccd(BREAKING):聚合项配置改为右键状态栏聚合区弹出勾选菜单
    // (Excel 口径),未勾选项不再渲染占位按钮。配置入口仍是可见的产品控件。
    const aggregates = page.getByTestId('status-aggregates')
    await aggregates.click({ button: 'right' })
    const menu = page.getByTestId('status-aggregate-menu')
    await expect(menu).toBeVisible()
    for (const key of ['numericCount', 'min', 'max']) {
      const item = page.getByTestId(`status-aggregate-menu-${key}`)
      await expect(item).toHaveAttribute('aria-checked', 'false')
      await item.click()
      await expect(item).toHaveAttribute('aria-checked', 'true')
    }
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expectAggregate(page, 'numericCount', '1')
    await expectAggregate(page, 'min', '10')
    await expectAggregate(page, 'max', '10')

    // 反向:取消勾选 sum 后该聚合项(含值)整体不渲染;再勾回恢复。
    await aggregates.click({ button: 'right' })
    const sumItem = page.getByTestId('status-aggregate-menu-sum')
    await expect(sumItem).toHaveAttribute('aria-checked', 'true')
    await sumItem.click()
    await expect(sumItem).toHaveAttribute('aria-checked', 'false')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('status-aggregate-sum-value')).toHaveCount(0)

    await aggregates.click({ button: 'right' })
    await page.getByTestId('status-aggregate-menu-sum').click()
    await page.keyboard.press('Escape')
    await expectAggregate(page, 'sum', '10')
  })

  test('sheet changes replace aggregate truth without retaining stale values', async ({ page }) => {
    await gotoWorkerDemo(page)

    const sheets = await readSheetList(page)
    const sheet1 = sheets.find((sheet) => sheet.name === 'Sheet1')
    const sheet3 = sheets.find((sheet) => sheet.name === 'Sheet3')
    expect(sheet1, 'canonical worker metadata must expose Sheet1').toBeDefined()
    expect(sheet3, 'canonical worker metadata must expose Sheet3').toBeDefined()

    // Canonical metadata identifies the sheet index; visible tab/grid
    // interactions own selection. Returning to Sheet1 must not retain 100.
    await expect
      .poll(() => readCells(page, sheet1!.idx, ['B4']))
      .toEqual([{ display: '10', formula: '' }])
    await expect
      .poll(() => readCells(page, sheet3!.idx, ['B4']))
      .toEqual([{ display: '100', formula: '' }])

    await cell(page, 'B4').click()
    await expectAggregate(page, 'sum', '10')
    await expectAggregate(page, 'average', '10')
    await expectAggregate(page, 'count', '1')

    await selectSheet(page, 'Sheet3')
    await expect(cellDisplay(page, 'A1')).toHaveText('Sheet3')
    await expect(cellDisplay(page, 'B4')).toHaveText('100')
    await cell(page, 'B4').click()
    await expectAggregate(page, 'sum', '100')
    await expectAggregate(page, 'average', '100')
    await expectAggregate(page, 'count', '1')

    await selectSheet(page, 'Sheet1')
    await expect(cellDisplay(page, 'A1')).toHaveText('Sheet1')
    await expect(cellDisplay(page, 'B4')).toHaveText('10')
    await cell(page, 'B4').click()
    await expectAggregate(page, 'sum', '10')
    await expectAggregate(page, 'average', '10')
    await expectAggregate(page, 'count', '1')
  })

  test('a full-sheet selection inside the rendered surface reports complete coverage', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    // 474f519 起渲染窗口=滚动表面(min(整表,5×视口))。本 demo 整表 20×10 落在
    // 表面内,任何选区都被投影窗口完整包含,data-truncated 恒为 false ——
    // 状态栏必须如实报告"覆盖完整",而不是残留旧的截断标记。
    // (truncated=true 需要"整表 > 5×视口"的 real-backend demo,当前没有;
    // 截断判定语义由 ui-core 的 status-bar-projection-truncation.test.ts 钉住。)
    const nameBox = page.getByTestId('name-box-input')
    await nameBox.fill('A1:J20')
    await nameBox.press('Enter')
    await expect(page.getByTestId('status-selection')).toHaveText('A1:J20')
    await expect(page.getByTestId('status-aggregates')).toHaveAttribute('data-truncated', 'false')
  })
})
