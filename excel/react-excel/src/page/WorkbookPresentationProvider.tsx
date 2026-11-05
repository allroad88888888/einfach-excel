import type { I18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { createContext, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { createWorkbookI18n, type UiLocale } from '../i18n/runtime'
import type { XlsxConverterLoader } from '../workbook/xlsx/xlsx-converter'
import { assertUniquePluginIds, SpreadsheetPluginsContext } from '../plugin/plugin-context'
import type { SpreadsheetPlugin } from '../plugin/types'
import { WorkbookUiOptionsContext, type WorkbookUiOptions } from './workbook-ui-options'

export interface WorkbookPresentationProps {
  readonly locale?: UiLocale
  readonly i18n?: I18n
  readonly renderer?: 'dom' | 'canvas'
  /** 提供后「文件」面板可打开与导出 .xlsx；转换器只在第一次用到时加载。 */
  readonly xlsx?: XlsxConverterLoader
  /** 可选功能包；按数组顺序挂载，核心不依赖其中任何一个。 */
  readonly plugins?: readonly SpreadsheetPlugin[]
  /** 内置界面区域的显隐；缺省全部显示。 */
  readonly ui?: WorkbookUiOptions
}

const NO_PLUGINS: readonly SpreadsheetPlugin[] = []
const DEFAULT_UI: WorkbookUiOptions = {}

export const WorkbookPresentationContext = createContext<{
  readonly controlledLocale: boolean
  readonly renderer: 'dom' | 'canvas'
  readonly xlsx?: XlsxConverterLoader
}>({ controlledLocale: false, renderer: 'dom' })

/** 展现状态由 Lingui 实例持有，不新增业务 atom；显式 locale 的选择权归宿主。 */
export function WorkbookPresentationProvider({
  children, locale, i18n, renderer = 'dom', xlsx, plugins = NO_PLUGINS, ui = DEFAULT_UI,
}:
  WorkbookPresentationProps & { readonly children: ReactNode }): ReactNode {
  const ownedI18n = useMemo(() => createWorkbookI18n(), [])
  const instance = i18n ?? ownedI18n
  // 插件目录在子树首次渲染前并入同一实例；load 按 id 合并，重复执行无副作用。
  useMemo(() => {
    assertUniquePluginIds(plugins)
    for (const plugin of plugins)
      for (const [code, messages] of Object.entries(plugin.messages ?? {}))
        if (messages) instance.load(code, messages)
  }, [instance, plugins])
  useLayoutEffect(() => {
    if (locale !== undefined && instance.locale !== locale) instance.activate(locale)
  }, [instance, locale])
  const presentation = useMemo(() => ({ controlledLocale: locale !== undefined, renderer, xlsx }),
    [locale, renderer, xlsx])
  return <WorkbookPresentationContext.Provider value={presentation}>
    <SpreadsheetPluginsContext.Provider value={plugins}>
      <WorkbookUiOptionsContext.Provider value={ui}>
        <I18nProvider i18n={instance}>{children}</I18nProvider>
      </WorkbookUiOptionsContext.Provider>
    </SpreadsheetPluginsContext.Provider>
  </WorkbookPresentationContext.Provider>
}
