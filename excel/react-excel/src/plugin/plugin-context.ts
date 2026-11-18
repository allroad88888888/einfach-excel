import { createContext, useContext } from 'react'
import type { SpreadsheetPlugin } from './types'
import { workbookRibbonItemIds } from '../page/workbook-ribbon-items'
import { BORDER_PRESETS, DIAGONAL_BORDER_PRESETS } from '@einfach-excel/spreadsheet-ui-core'

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
  const conditions = new Set<string>(['equals', 'contains', 'range', 'list'])
  const borderPresets = new Set<string>(BORDER_PRESETS)
  for (const plugin of plugins) {
    if (seen.has(plugin.id)) throw new Error(`Duplicate spreadsheet plugin id: ${plugin.id}`)
    seen.add(plugin.id)
    for (const item of plugin.borderPresets ?? []) {
      if (borderPresets.has(item.preset))
        throw new Error(`Duplicate border preset: ${item.preset}`)
      if (!(DIAGONAL_BORDER_PRESETS as readonly string[]).includes(item.preset))
        throw new Error(`Unknown border preset: ${item.preset}`)
      borderPresets.add(item.preset)
    }
    for (const condition of plugin.filterConditions ?? []) {
      if (conditions.has(condition.kind))
        throw new Error(`Duplicate filter condition editor: ${condition.kind}`)
      conditions.add(condition.kind)
    }
    const richTextTools = new Set<string>()
    for (const item of plugin.richTextTools ?? []) {
      if (richTextTools.has(item.id))
        throw new Error(`Duplicate rich text tool: ${plugin.id}:${item.id}`)
      richTextTools.add(item.id)
    }
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
