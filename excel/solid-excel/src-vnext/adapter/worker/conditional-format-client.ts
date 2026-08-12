// 一句话：校验 worker 引擎返回的条件格式配置快照。

import type { ConditionalFormatRuleEntry } from '@einfach/spreadsheet-ui-core'
import { cloneConditionalFormatRuleEntry } from '@einfach/spreadsheet-ui-core'
import type { ConditionalFormatConfigSnapshotWire } from '../worker-protocol'
import type { WorkerBackendState } from './state'

function invalidSnapshot(): never {
  throw new Error('worker returned an invalid conditional-format configuration snapshot')
}

export function requireConditionalFormatMethods(state: WorkerBackendState): {
  list: NonNullable<typeof state.client.listConditionalFormats>
  set: NonNullable<typeof state.client.setConditionalFormatRule>
  remove: NonNullable<typeof state.client.removeConditionalFormatRule>
} {
  const {
    listConditionalFormats: list,
    setConditionalFormatRule: set,
    removeConditionalFormatRule: remove,
  } = state.client
  if (typeof list !== 'function' || typeof set !== 'function' || typeof remove !== 'function') {
    throw new Error('worker runtime does not implement conditional-format configuration')
  }
  return { list, set, remove }
}

export function snapshotConditionalFormatConfig(
  snapshot: ConditionalFormatConfigSnapshotWire,
  sheet: number,
): ConditionalFormatConfigSnapshotWire {
  if (
    snapshot.sheet !== sheet ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    !Array.isArray(snapshot.rules)
  ) {
    return invalidSnapshot()
  }
  return {
    sheet,
    revision: snapshot.revision,
    rules: snapshot.rules.map(
      (rule): ConditionalFormatRuleEntry => cloneConditionalFormatRuleEntry(rule),
    ),
  }
}

export async function readConditionalFormatConfig(
  state: WorkerBackendState,
  sheet: number,
): Promise<ConditionalFormatConfigSnapshotWire> {
  const list = state.client.listConditionalFormats
  if (typeof list !== 'function') {
    return { sheet, revision: 0, rules: [] }
  }
  const snapshot = await list(sheet)
  return snapshotConditionalFormatConfig(snapshot, sheet)
}
