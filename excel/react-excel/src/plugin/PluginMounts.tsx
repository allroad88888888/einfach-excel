import { useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import type { WorkbookRibbonTab } from '@einfach-excel/spreadsheet-ui-core'
import { Fragment } from 'react'
import { useSpreadsheetPlugins } from './plugin-context'
import { contextMenuItemShown, useWorkbookUiOptions } from '../page/workbook-ui-options'
import type { ContextMenuContribution } from './types'

/** 插件功能区分组排在内置分组之后，沿用内置的分类显隐规则。 */
export function PluginRibbonGroups({ tab }: { readonly tab: WorkbookRibbonTab }) {
  const plugins = useSpreadsheetPlugins()
  return plugins.flatMap(plugin => (plugin.ribbon ?? []).map(({ id, tab: home, Group }) => (
    <div key={`${plugin.id}:${id}`} className="ribbon-tool-group"
      data-plugin={plugin.id} data-inactive={tab !== 'Start' && tab !== home}>
      <Group />
    </div>
  )))
}

function PluginMenuItem({ item, close }: {
  readonly item: ContextMenuContribution
  readonly close: () => void
}) {
  const { i18n } = useLingui()
  const run = useSetAtom(item.command)
  return <button type="button" role="menuitem" data-menu-item={item.id}
    onClick={() => { close(); void run() }}>{i18n._(item.label)}</button>
}

export function PluginMenuItems({ close }: { readonly close: () => void }) {
  const plugins = useSpreadsheetPlugins()
  const ui = useWorkbookUiOptions()
  return plugins.flatMap(plugin => (plugin.contextMenu ?? [])
    .filter(item => contextMenuItemShown(ui, item.id))
    .map(item => <PluginMenuItem key={`${plugin.id}:${item.id}`} item={item} close={close} />))
}

export function PluginEditorAdornments() {
  const plugins = useSpreadsheetPlugins()
  return plugins.map(plugin => (
    <Fragment key={plugin.id}>
      {(plugin.editorAdornments ?? []).map((Adornment, index) => <Adornment key={index} />)}
    </Fragment>
  ))
}

export function PluginPanels() {
  const plugins = useSpreadsheetPlugins()
  return plugins.map(plugin => (
    <Fragment key={plugin.id}>
      {(plugin.panels ?? []).map((Panel, index) => <Panel key={index} />)}
    </Fragment>
  ))
}
