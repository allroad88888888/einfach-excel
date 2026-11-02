import type { SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 冻结窗格读写的 Rust 命令数据契约。 */
export interface ViewportFreezeConfig {
  rows: number
  cols: number
}

export interface ReadFreezeConfigRequest extends SheetRef {
  kind: 'read-freeze-config'
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface ReadFreezeConfigResult extends SheetRef {
  kind: 'freeze-config'
  freeze: ViewportFreezeConfig
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface SetFreezeConfigRequest extends SheetRef {
  kind: 'set-freeze-config'
  freeze: ViewportFreezeConfig
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
