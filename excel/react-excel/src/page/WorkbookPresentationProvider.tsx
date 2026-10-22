import type { I18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { createContext, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { createWorkbookI18n, type UiLocale } from '../i18n/runtime'

export interface WorkbookPresentationProps {
  readonly locale?: UiLocale
  readonly i18n?: I18n
  readonly renderer?: 'dom' | 'canvas'
}

export const WorkbookPresentationContext = createContext({ controlledLocale: false, renderer: 'dom' as 'dom' | 'canvas' })

/** 展现状态由 Lingui 实例持有，不新增业务 atom；显式 locale 的选择权归宿主。 */
export function WorkbookPresentationProvider({ children, locale, i18n, renderer = 'dom' }:
  WorkbookPresentationProps & { readonly children: ReactNode }): ReactNode {
  const ownedI18n = useMemo(() => createWorkbookI18n(), [])
  const instance = i18n ?? ownedI18n
  useLayoutEffect(() => {
    if (locale !== undefined && instance.locale !== locale) instance.activate(locale)
  }, [instance, locale])
  const presentation = useMemo(() => ({ controlledLocale: locale !== undefined, renderer }),
    [locale, renderer])
  return <WorkbookPresentationContext.Provider value={presentation}>
    <I18nProvider i18n={instance}>{children}</I18nProvider>
  </WorkbookPresentationContext.Provider>
}
