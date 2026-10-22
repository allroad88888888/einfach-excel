import { createWorkbookI18n, supportedUiLocale, type UiLocale } from '../../i18n/runtime'

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

export function demoPresentation() {
  return { i18n, renderer: new URLSearchParams(window.location.search).get('renderer') === 'canvas'
    ? 'canvas' as const : 'dom' as const }
}
