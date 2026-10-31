import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { repeatLabelFor } from './label'
import type { RepeatIntent, RepeatLabel, RepeatRecord } from './types'

const recordBackingAtom = atom<{
  readonly connection: RustWorkbookConnection
  readonly record: RepeatRecord
} | null>(null)
recordBackingAtom.debugLabel = 'spreadsheet.repeat.recordBacking'

/** 最近一次可重复动作；换工作簿连接后自然失效。 */
export const lastRepeatRecordAtom = atom((get): RepeatRecord | null => {
  const backing = get(recordBackingAtom)
  return backing && backing.connection === get(rustWorkbookConnectionAtom) ? backing.record : null
})
lastRepeatRecordAtom.debugLabel = 'spreadsheet.repeat.lastRecord'

/** 界面只需要名称：非空即可重复。 */
export const repeatLabelAtom = atom(
  (get): RepeatLabel | null => get(lastRepeatRecordAtom)?.label ?? null,
)
repeatLabelAtom.debugLabel = 'spreadsheet.repeat.label'

/** 各命令在 Rust 确认成功后调用；撤销、重做、粘贴、输入不会走到这里。 */
export const recordRepeatIntentAtom = atom(null, (get, set, intent: RepeatIntent): void => {
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection) return
  set(recordBackingAtom, { connection, record: { intent, label: repeatLabelFor(intent) } })
})
recordRepeatIntentAtom.debugLabel = 'spreadsheet.repeat.record'
