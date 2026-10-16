import { setupI18n } from '@lingui/core'
import { messages as en } from './locales/en/messages.po'
import { messages as zh } from './locales/zh/messages.po'

export type UiLocale = 'en' | 'zh'
export const UI_LOCALE_STORAGE_KEY = 'react-excel.ui-locale'

/** 接受常用 BCP 47 地区变体；不把未知语言误识别为已支持语言。 */
export function supportedUiLocale(value: string | null | undefined): UiLocale | undefined {
  const language = value?.toLowerCase().split(/[-_]/)[0]
  return language === 'en' || language === 'zh' ? language : undefined
}

/** URL 优先于显式保存的偏好，最后才使用浏览器语言；默认英文。 */
export function resolveUiLocale(
  query: string,
  saved: string | null,
  languages: readonly string[],
): UiLocale {
  return supportedUiLocale(new URLSearchParams(query).get('locale'))
    ?? supportedUiLocale(saved)
    ?? languages.map(supportedUiLocale).find((locale) => locale !== undefined)
    ?? 'en'
}

function initialUiLocale(): UiLocale {
  if (typeof window === 'undefined') return 'en'
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)
  } catch {
    // 隐私模式禁止存储时，仍可使用 URL／浏览器语言并正常切换。
  }
  return resolveUiLocale(window.location.search, saved, window.navigator.languages)
}

/** 同页工作簿共用界面语言，业务 store 与 Rust runtime 仍各自隔离。 */
export const i18n = setupI18n({ locale: initialUiLocale(), messages: { en, zh } })

export function activateUiLocale(locale: UiLocale): void {
  i18n.activate(locale)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale)
  } catch {
    // 保存失败不应阻断本次界面切换，更不能影响工作簿写入。
  }
  // 已使用显式语言链接时，同步链接，避免刷新后覆盖用户刚刚作出的选择。
  const url = new URL(window.location.href)
  if (url.searchParams.has('locale')) {
    url.searchParams.set('locale', locale)
    window.history.replaceState(window.history.state, '', url)
  }
}
