import { useAtomValue, useSetAtom } from '@einfach/react'
import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { editingIsActiveAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react'
import { pingSampleAtom, samplePingCountAtom } from './core'
import { EDITING_MESSAGE, messages, PING_MESSAGE, STATUS_MESSAGE } from './messages'

function SamplePingButton() {
  const { i18n } = useLingui()
  const ping = useSetAtom(pingSampleAtom)
  return <button type="button" className="tool-button" data-sample-plugin="ribbon"
    onClick={() => ping()}>{i18n._(PING_MESSAGE)}</button>
}

function SampleStatusPanel() {
  const { i18n } = useLingui()
  const count = useAtomValue(samplePingCountAtom)
  return <div role="status" data-sample-plugin="panel">{i18n._({ ...STATUS_MESSAGE, values: { count } })}</div>
}

function SampleEditingMarker() {
  const { i18n } = useLingui()
  const editing = useAtomValue(editingIsActiveAtom)
  return editing ? <span data-sample-plugin="editor">{i18n._(EDITING_MESSAGE)}</span> : null
}

/** 覆盖全部贡献点的仓内样例；验证插件只经公开入口接入工作簿。 */
export const samplePlugin: SpreadsheetPlugin = {
  id: 'sample',
  ribbon: [{ id: 'ping', tab: 'View', Group: SamplePingButton }],
  contextMenu: [{ id: 'sample.ping', label: PING_MESSAGE, command: pingSampleAtom }],
  editorAdornments: [SampleEditingMarker],
  panels: [SampleStatusPanel],
  messages,
}
