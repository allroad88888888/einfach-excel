import { useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { Fragment, useMemo } from 'react'
import { useSpreadsheetPlugins } from './plugin-context'
import { contextMenuItemShown, ribbonItemShown, useWorkbookUiOptions } from '../page/workbook-ui-options'
import type { ContextMenuContribution } from './types'
import type { WorkbookRibbonGroup } from '../workbook/chrome/ribbon/ribbon-groups'

/** 插件功能区分组排在内置分组之后，只在声明的分类显示，并和内置组一样按整组收进“更多”。 */
export function usePluginRibbonGroups(): readonly WorkbookRibbonGroup[] {
  const plugins = useSpreadsheetPlugins()
  const ui = useWorkbookUiOptions()
  return useMemo(() => plugins.flatMap(plugin => (plugin.ribbon ?? [])
    .filter(({ id }) => ribbonItemShown(ui, `plugin:${plugin.id}:${id}`))
    .map(({ id, tab, Group }) => ({
      id: `plugin:${plugin.id}:${id}`, tab, layout: 'stack' as const, Content: Group, plugin: plugin.id,
    }))), [plugins, ui])
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
