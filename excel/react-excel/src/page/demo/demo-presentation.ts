import { imageExportPlugin } from '@einfach-excel/plugin-image-export'
import { datePickerPlugin } from '@einfach-excel/plugin-date-picker'
import { samplePlugin } from '@einfach-excel/plugin-sample'
import { createWorkbookI18n, supportedUiLocale, type UiLocale } from '../../i18n/runtime'
import type { SpreadsheetPlugin } from '../../plugin/types'
import type { SheetDefaults } from '@einfach-excel/spreadsheet-ui-core'
import type { WorkbookUiOptions } from '../workbook-ui-options'

export const UI_LOCALE_STORAGE_KEY = 'react-excel.ui-locale'

/** 演示站专属偏好策略；公开组件不导入本模块。 */
export function resolveUiLocale(
  query: string, saved: string | null, languages: readonly string[],
): UiLocale {
  return supportedUiLocale(new URLSearchParams(query).get('locale'))
    ?? supportedUiLocale(saved)
    ?? languages.map(supportedUiLocale).find((locale) => locale !== undefined)
    ?? 'en'
}

function initialUiLocale(): UiLocale {
  if (typeof window === 'undefined') return 'en'
  let saved: string | null = null
  try { saved = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY) } catch {
    // 禁用存储时仍保留 URL 与浏览器语言回退。
  }
  return resolveUiLocale(window.location.search, saved, window.navigator.languages)
}

export const i18n = createWorkbookI18n(initialUiLocale())

function savePreference(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, i18n.locale) } catch {
    // 偏好保存失败不能中断界面切换或工作簿写入。
  }
  const url = new URL(window.location.href)
  if (url.searchParams.has('locale')) {
    url.searchParams.set('locale', i18n.locale)
    window.history.replaceState(window.history.state, '', url)
  }
}

i18n.on('change', savePreference)

export function activateUiLocale(locale: UiLocale): void { i18n.activate(locale) }

/** 演示站按需加载 XLSX 转换器：只在用户第一次打开或导出 .xlsx 时下载 WASM。 */
async function loadXlsx() {
  const module = await import('@einfach-excel/xlsx')
  await module.default()
  return module
}

/** `?plugins=sample` 挂上仓内样例插件；数组在模块内固定，挂载期间身份不变。 */
const DEMO_PLUGINS: Readonly<Record<string, SpreadsheetPlugin>> = {
  sample: samplePlugin, 'date-picker': datePickerPlugin, 'image-export': imageExportPlugin,
}

function demoPlugins(query: string): readonly SpreadsheetPlugin[] {
  const ids = new URLSearchParams(query).get('plugins')?.split(',') ?? []
  return ids.flatMap(id => DEMO_PLUGINS[id] ? [DEMO_PLUGINS[id]] : [])
}

const plugins = typeof window === 'undefined' ? [] : demoPlugins(window.location.search)

/** `?hide=ribbon,sheetBar,menu,menu:cells.insert` 演示宿主的界面显隐配置。 */
export function demoUiOptions(query: string): WorkbookUiOptions {
  const ids = new URLSearchParams(query).get('hide')?.split(',').filter(Boolean) ?? []
  const areas = ['header', 'ribbon', 'formulaBar', 'sheetBar', 'statusBar'] as const
  const hiddenItems = ids.filter(id => id.startsWith('menu:')).map(id => id.slice(5))
  return {
    ...Object.fromEntries(areas.filter(area => ids.includes(area)).map(area => [area, false])),
    ...(ids.includes('menu') ? { contextMenu: false as const }
      : hiddenItems.length ? { contextMenu: { hidden: hiddenItems } } : {}),
  }
}

const ui = typeof window === 'undefined' ? {} : demoUiOptions(window.location.search)

/** Optional host configuration: ?rowHeight=36&colWidth=160&fontSize=18. */
const defaults: SheetDefaults = Object.fromEntries(
  ['rowHeight', 'colWidth', 'fontSize'].flatMap(key => {
    const value = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(key)
    return value === null ? [] : [[key, Number(value)]]
  }),
)

export function demoPresentation() {
  return { i18n, xlsx: loadXlsx, plugins, ui, defaults,
    renderer: new URLSearchParams(window.location.search).get('renderer') === 'canvas'
      ? 'canvas' as const : 'dom' as const }
}
