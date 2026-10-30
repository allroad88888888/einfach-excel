import type { I18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { createContext, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { createWorkbookI18n, type UiLocale } from '../i18n/runtime'
import type { XlsxConverterLoader } from '../workbook/xlsx/xlsx-converter'

export interface WorkbookPresentationProps {
  readonly locale?: UiLocale
  readonly i18n?: I18n
  readonly renderer?: 'dom' | 'canvas'
  /** 提供后「文件」面板可打开与导出 .xlsx；转换器只在第一次用到时加载。 */
  readonly xlsx?: XlsxConverterLoader
}

export const WorkbookPresentationContext = createContext<{
  readonly controlledLocale: boolean
  readonly renderer: 'dom' | 'canvas'
  readonly xlsx?: XlsxConverterLoader
}>({ controlledLocale: false, renderer: 'dom' })

/** 展现状态由 Lingui 实例持有，不新增业务 atom；显式 locale 的选择权归宿主。 */
export function WorkbookPresentationProvider({ children, locale, i18n, renderer = 'dom', xlsx }:
  WorkbookPresentationProps & { readonly children: ReactNode }): ReactNode {
  const ownedI18n = useMemo(() => createWorkbookI18n(), [])
  const instance = i18n ?? ownedI18n
  useLayoutEffect(() => {
    if (locale !== undefined && instance.locale !== locale) instance.activate(locale)
  }, [instance, locale])
  const presentation = useMemo(() => ({ controlledLocale: locale !== undefined, renderer, xlsx }),
    [locale, renderer, xlsx])
  return <WorkbookPresentationContext.Provider value={presentation}>
    <I18nProvider i18n={instance}>{children}</I18nProvider>
  </WorkbookPresentationContext.Provider>
}
