import { setupI18n } from '@lingui/core'
import { messages as en } from './locales/en/messages.po'
import { messages as zh } from './locales/zh/messages.po'

export type UiLocale = 'en' | 'zh'

/** 接受常用 BCP 47 地区变体；不把未知语言误识别为已支持语言。 */
export function supportedUiLocale(value: string | null | undefined): UiLocale | undefined {
  const language = value?.toLowerCase().split(/[-_]/)[0]
  return language === 'en' || language === 'zh' ? language : undefined
}

/** 每个默认挂载拥有独立词典实例；库不读取宿主 URL、浏览器语言或存储。 */
export function createWorkbookI18n(locale: UiLocale = 'en') {
  return setupI18n({ locale, messages: { en, zh } })
}
