import { expect, test, type Page } from '@playwright/test'

import { cellDisplay, expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * 后端 port 缺失时的 fail-closed 隐藏/禁用矩阵
 * （vnext-ts-failclosed-menu 的扩展）。
 *
 * TS worker 运行时的能力见证
 * （`worker-runtime-ts.ts::TS_WORKER_RUNTIME_CAPABILITIES`）声明
 * `structuralEdits: false` / `sortRange: false` / `structuredTables: false` /
 * `engineHiddenState: false`。适配层据此撤除对应 backend port，UI core 对
 * 缺 port 的条目按约定隐藏（capability 条目）或禁用（'always' 条目带
 * disabledReason）：
 *
 *   - Data 菜单：sortAsc/sortDesc（sortRange 口）、removeDuplicates
 *     （removeRows 口，随 structuralEdits）、createTable/toggleTotals
 *     （structuredTables 口）→ ts 隐藏。
 *   - 工具栏：sort 入口整体消失（`<Show when={sortSupported()}>`）；filter
 *     按钮保留但 disabled（filterSortEntrypointProjection 的 capability 分支）。
 *   - find/replace：worker 后端根本不实现 searchRange/replaceMatches（与
 *     ts/wasm 无关），按钮在两个 project 上都 disabled；wave5 静态 host 有
 *     该口 → enabled。
 *
 * 能力见证异步落地（describeCapabilities 在 initWorkbook 之后），菜单栏与
 * 工具栏在 backend.ready() 后 recapture。等 C2=13（投影往返完成，晚于
 * ready）保证断言读到 post-witness 真相。
 */

const TS_HIDDEN_DATA_ITEM_IDS = [
  'data.sortAsc',
  'data.sortDesc',
  'data.removeDuplicates',
  'data.createTable',
  'data.toggleTotals',
] as const

/** 双端始终可见的控制项，证明 Data 菜单本身渲染完整。 */
const DATA_CONTROL_ITEM_IDS = ['data.filter', 'data.textToColumns', 'data.validation'] as const

function activeBackend(): 'wasm' | 'ts' {
  const name = test.info().project.name
  expect(['wasm', 'ts']).toContain(name)
  return name as 'wasm' | 'ts'
}

async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

test.describe('后端 port 缺失 fail-closed 矩阵', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Data 菜单能力条目跟随后端 port 见证', async ({ page }) => {
    const backend = activeBackend()
    await gotoWorkerDemo(page)

    await page.getByTestId('menu-bar-button-data').click()
    await expect(page.getByTestId('menu-bar-dropdown-data')).toBeVisible()

    for (const id of DATA_CONTROL_ITEM_IDS) {
      await expect(page.getByTestId(`menu-bar-item-${id}`)).toBeVisible()
    }

    if (backend === 'ts') {
      for (const id of TS_HIDDEN_DATA_ITEM_IDS) {
        await expect(page.getByTestId(`menu-bar-item-${id}`)).toHaveCount(0)
      }
    } else {
      for (const id of TS_HIDDEN_DATA_ITEM_IDS) {
        await expect(page.getByTestId(`menu-bar-item-${id}`)).toBeVisible()
      }
    }

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('menu-bar-dropdown-data')).toHaveCount(0)
  })

  test('工具栏 sort 入口随 sortRange 端口出现/消失', async ({ page }) => {
    const backend = activeBackend()
    await gotoWorkerDemo(page)

    if (backend === 'ts') {
      // #24：无物理排序端口 → 入口整体消失而非假装可点。
      await expect(page.getByTestId('toolbar-btn-sort')).toHaveCount(0)
      // filter 是 'always' 条目：保留可见但按 capability 缺失禁用。
      const filterButton = page.getByTestId('toolbar-btn-filter')
      await expect(filterButton).toBeVisible()
      await expect(filterButton).toBeDisabled()
    } else {
      await expect(page.getByTestId('toolbar-btn-sort')).toBeVisible()
      await expect(page.getByTestId('toolbar-btn-filter')).toBeVisible()
    }
  })

  test('find/replace 在 worker 后端无 searchRange 端口时双端禁用', async ({ page }) => {
    await gotoWorkerDemo(page)
    const button = page.getByTestId('toolbar-btn-find-replace')
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()
  })

  test('find/replace 在 wave5 静态 host（有 searchRange 端口）启用', async ({ page }) => {
    guardConsoleErrors(page)
    await gotoRoot(page)
    await page.getByTestId('nav-tab-vnext-wave5').click()
    await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })

    const button = page.getByTestId('toolbar-btn-find-replace')
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
  })
})
