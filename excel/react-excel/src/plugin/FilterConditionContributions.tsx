import { useLingui, Trans } from '@lingui/react/macro'
import { useSpreadsheetPlugins } from './plugin-context'
import type { ColumnFilterRule } from '@einfach-excel/spreadsheet-ui-core'

export function FilterConditionContributions({ index, kind }: {
  readonly index: number; readonly kind: ColumnFilterRule['kind']
}) {
  const plugins = useSpreadsheetPlugins()
  const contributed = plugins.some(plugin =>
    plugin.filterConditions?.some(item => item.kind === kind))
  const builtIn = ['equals', 'contains', 'range', 'list'].includes(kind)
  return <>
    {!builtIn && !contributed && <p className="size-hint">
      <Trans>This saved condition is preserved. Enable its plugin to edit it.</Trans>
    </p>}
    {plugins.flatMap(plugin => (plugin.filterConditions ?? []).map(({ kind: editorKind, Editor }) =>
      <Editor key={`${plugin.id}:${editorKind}`} index={index} />))}
  </>
}

export function SavedFilterConditionOption({ kind }: { readonly kind: ColumnFilterRule['kind'] }) {
  const { i18n, t } = useLingui()
  const plugins = useSpreadsheetPlugins()
  const contribution = plugins.flatMap(plugin => plugin.filterConditions ?? [])
    .find(item => item.kind === kind)
  if (['equals', 'contains', 'range', 'list'].includes(kind)) return null
  return <option value={kind}>{contribution ? i18n._(contribution.label) : t`Saved condition`}</option>
}
