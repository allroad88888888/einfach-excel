import type { SelectionState } from '../selection/types'
import type { SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 协同光标发布与订阅的边界数据契约。 */
export interface PublishLocalPresenceRequest extends SheetRef {
  kind: 'publish-presence'
  selection: SelectionState
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export type SubscribePresenceUnsubscribe = () => void
