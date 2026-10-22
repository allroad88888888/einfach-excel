import type { Getter, Setter } from '@einfach/core'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { workbookConnectionId } from './connection'
import { hostControlsBackingAtom, hostSubscriptionAtom, workbookChangeBackingAtom } from './state'
import type { WorkbookChangeEvent } from './types'

function changeEvent(value: unknown, connectionId: string): WorkbookChangeEvent | undefined {
  const event = value as Omit<WorkbookChangeEvent, 'connectionId'>
  if (!event || typeof event.operationId !== 'string' || typeof event.kind !== 'string' ||
    !Number.isSafeInteger(event.revision) || event.revision < 0 ||
    !['user', 'api', 'import', 'refresh', 'history'].includes(event.source) ||
    !Array.isArray(event.changes) || event.changes.length > 4096) return
  return Object.freeze({ ...event, connectionId, operationId: `${connectionId}:${event.operationId}`,
    changes: Object.freeze(event.changes.map((change) => Object.freeze({
      sheetId: change.sheetId,
      ranges: Object.freeze(change.ranges.map((range: WorkbookChangeEvent['changes'][number]['ranges'][number]) =>
        Object.freeze({ ...range }))),
    }))),
  })
}

/** 订阅随 Store 当前连接绑定；迟到事件不能写入换簿后的 Store。 */
export function bindHostConnection(get: Getter, set: Setter,
  connection: RustWorkbookConnection | null,
  owns: () => boolean): void {
  get(hostSubscriptionAtom)?.dispose()
  set(hostSubscriptionAtom, null)
  if (!connection) { set(workbookChangeBackingAtom, null); return }
  const connectionId = workbookConnectionId(connection)
  const unsubscribe = connection.subscribe?.((value) => {
    if (!owns()) return
    const event = changeEvent(value, connectionId)
    if (event) set(workbookChangeBackingAtom, event)
  })
  set(hostSubscriptionAtom, unsubscribe ? { dispose: unsubscribe } : null)
  set(workbookChangeBackingAtom, Object.freeze({ connectionId,
    operationId: `${connectionId}:import`, revision: 0, source: 'import',
    kind: 'workbook.open', changes: Object.freeze([]),
  }))
}

/** 候选连接发布前完成控制同步，失败不能交换掉仍可用的旧工作簿。 */
export async function synchronizeHostControls(get: Getter,
  connection: RustWorkbookConnection): Promise<void> {
  let controls
  do {
    controls = get(hostControlsBackingAtom)
    await connection.request('host.configure', controls)
  } while (controls !== get(hostControlsBackingAtom))
}
