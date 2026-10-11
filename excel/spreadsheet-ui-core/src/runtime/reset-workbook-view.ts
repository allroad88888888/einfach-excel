import { atom } from '@einfach/core'
import { projectionLaneBackingAtom, projectionSnapshotBackingAtom,
  IDLE_PROJECTION_SNAPSHOT } from '../projection/state'
import { viewportSizeOverridesAtom, DEFAULT_VIEWPORT_SIZE_OVERRIDES,
  rotateViewportMetadataProjectionIdentity } from '../viewport/size-overrides'
import { findReplaceStateAtom } from '../find-replace/state'
import { cancelPointerAtom } from '../pointer'

/** 只在工作簿连接被替换时回收旧视图；普通切表继续保留各表状态。 */
export const resetWorkbookViewAtom = atom(null, (get, set): void => {
  set(projectionLaneBackingAtom, { visibleWindow: { active: null, queued: null }, range: null })
  set(projectionSnapshotBackingAtom, IDLE_PROJECTION_SNAPSHOT)
  set(viewportSizeOverridesAtom, DEFAULT_VIEWPORT_SIZE_OVERRIDES)
  rotateViewportMetadataProjectionIdentity(set)
  set(cancelPointerAtom)
  set(findReplaceStateAtom, { ...get(findReplaceStateAtom), open: false, busy: null,
    origin: null, result: null, error: null, notice: null })
})
