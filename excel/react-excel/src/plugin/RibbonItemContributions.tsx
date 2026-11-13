import { Fragment } from 'react'
import { ribbonItemShown, useWorkbookUiOptions } from '../page/workbook-ui-options'
import { useSpreadsheetPlugins } from './plugin-context'

/** 插件控件沿插件配置顺序进入现有组；宿主隐藏锚点不影响贡献自身的显隐。 */
export function RibbonItemContributions({ after }: { readonly after: string }) {
  const plugins = useSpreadsheetPlugins()
  const ui = useWorkbookUiOptions()
  return plugins.flatMap(plugin => (plugin.ribbonItems ?? [])
    .filter(item => item.after === after && ribbonItemShown(ui, `plugin:${plugin.id}:${item.id}`))
    .map(({ id, Item }) => <Fragment key={`${plugin.id}:${id}`}><Item /></Fragment>))
}
