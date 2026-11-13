import { createContext, useContext } from 'react'
import type { SpreadsheetPlugin } from './types'
import { workbookRibbonItemIds } from '../page/workbook-ribbon-items'

const NO_PLUGINS: readonly SpreadsheetPlugin[] = []

/** 插件清单是宿主的静态配置，不进入工作簿 atom，也不随编辑变化。 */
export const SpreadsheetPluginsContext = createContext<readonly SpreadsheetPlugin[]>(NO_PLUGINS)

export function useSpreadsheetPlugins(): readonly SpreadsheetPlugin[] {
  return useContext(SpreadsheetPluginsContext)
}

/** 重复 id 会让两份贡献无法区分，挂载时直接拒绝。 */
export function assertUniquePluginIds(plugins: readonly SpreadsheetPlugin[]): void {
  const seen = new Set<string>()
  const anchors = new Set<string>(workbookRibbonItemIds)
  for (const plugin of plugins) {
    if (seen.has(plugin.id)) throw new Error(`Duplicate spreadsheet plugin id: ${plugin.id}`)
    seen.add(plugin.id)
    const contributions = new Set<string>()
    for (const item of [...(plugin.ribbon ?? []), ...(plugin.ribbonItems ?? [])]) {
      if (contributions.has(item.id))
        throw new Error(`Duplicate ribbon contribution id: ${plugin.id}:${item.id}`)
      contributions.add(item.id)
    }
    for (const item of plugin.ribbonItems ?? []) {
      if (!anchors.has(item.after)) throw new Error(`Unknown ribbon item anchor: ${item.after}`)
    }
  }
}
