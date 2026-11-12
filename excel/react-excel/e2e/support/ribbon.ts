import type { Locator, Page } from '@playwright/test'

// 与 WORKBOOK_RIBBON_TABS 顺序一致；按位置点标签，不依赖界面语言。
const TAB_INDEX: Record<string, number> = { Start: 0, Insert: 1, Formulas: 2, Data: 3, View: 4 }

/** 按工具 ID（data-ribbon-item）或可访问名称（aria-label，没有时取文字）找功能区控件。 */
type Query = { readonly id: string } | { readonly name: string }

function pageOf(scope: Page | Locator): Page {
  return 'page' in scope && typeof scope.page === 'function' ? scope.page() : (scope as Page)
}

const nextFrame = (page: Page) => page.evaluate(() =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

function placement(tools: Locator, query: Query) {
  return tools.evaluate((element, query) => {
    const target =
      'id' in query
        ? element.querySelector(`[data-ribbon-item="${query.id}"]`)
        : [...element.querySelectorAll('button, select, input, [role="button"]')].find(
            (control) =>
              (control.getAttribute('aria-label') ?? control.textContent?.trim()) === query.name,
          )
    if (!target) return null
    return {
      visible: target.checkVisibility(),
      tab: target.closest<HTMLElement>('[data-ribbon-group]')?.dataset.ribbonTab ?? null,
      folded: target.closest('.ribbon-more') !== null,
    }
  }, query)
}

/**
 * 像用户一样把功能区工具露出来：先点它所在组的分类标签，窄屏下组收进“更多”时再点开“更多”。
 * 工具已可见、不在功能区或有模态弹窗挡住时不动。
 */
async function reveal(scope: Page | Locator, query: Query) {
  const page = pageOf(scope)
  // 上一次命令的自动收起、分类测量都在渲染帧中完成，不能在临时的行内布局上返回。
  await nextFrame(page)
  if (await page.evaluate(() => document.querySelector('dialog:modal') !== null)) return
  const tools = scope.locator('.ribbon-tools').first()
  let place = await placement(tools, query)
  if (!place || place.visible) return
  const index = place.tab ? TAB_INDEX[place.tab] : undefined
  if (index !== undefined) {
    const tab = scope.locator('.ribbon-tab').nth(index)
    if ((await tab.getAttribute('aria-selected')) !== 'true') {
      await tab.click()
      await nextFrame(page)
    }
    place = await placement(tools, query)
    if (!place || place.visible) return
  }
  if (!place.folded) return
  const more = scope.locator('[data-ribbon-more]').first()
  if ((await more.getAttribute('aria-expanded')) !== 'true') {
    await more.click()
    await nextFrame(page)
  }
}

/** 按工具 ID 露出工具；工具本身仍由调用方用可访问名称定位和操作。 */
export async function showRibbonItem(scope: Page | Locator, id: string) {
  await reveal(scope, { id })
}

/** 按可访问名称露出功能区控件，名称是变量或插件工具时用。 */
export async function showRibbonControl(scope: Page | Locator, name: string) {
  await reveal(scope, { name })
}
