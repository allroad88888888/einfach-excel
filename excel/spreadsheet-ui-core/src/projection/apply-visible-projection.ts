import { atom, type Setter } from '@einfach/core'
import type { VisibleProjectionRequest, VisibleProjectionResult } from '../contracts'
import { validateProjectionResult } from './contracts'
import {
  freezeProjectionRequest,
  freezeProjectionResult,
  freezeProjectionSnapshot,
  projectionErrorFrom,
  projectionLaneBackingAtom,
  projectionSnapshotBackingAtom,
} from './state'
import type {
  ApplyVisibleProjectionInput,
  ApplyVisibleProjectionOutcome,
  ProjectionSnapshot,
} from './types'
import { applyProjectionSizes } from './projection-sizes'
import { recordPublishedGeometry, sameVisibleView } from './covering-result'
import { applySheetVisibility } from '../viewport/hidden-state'
import { setSheetProtectionAtom } from '../protection'
import { hydrateCustomFormulaDefinitionsAtom } from '../custom-formulas/expression-catalog'
import {
  hydrateCalculationModeAtom,
  hydrateIterativeCalculationAtom,
} from '../calculation/mode-state'
import { syncWatchedCellsAtom } from '../formula-auditing/watch-command'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'

// 最近一次由修改发布（或因修改投影无效而置错）的快照。
const mutationSnapshotBackingAtom = atom<ProjectionSnapshot | null>(null)
mutationSnapshotBackingAtom.debugLabel = 'spreadsheet.projection.mutationSnapshot.state'

function publish(set: Setter, snapshot: ProjectionSnapshot): void {
  const frozen = freezeProjectionSnapshot(snapshot)
  set(projectionSnapshotBackingAtom, frozen)
  set(mutationSnapshotBackingAtom, frozen)
}

/** Publishes the projection bundled with a mutation without opening a second read lane. */
export const applyVisibleProjectionAtom = atom(
  null,
  (get, set, input: ApplyVisibleProjectionInput): ApplyVisibleProjectionOutcome => {
    const current = get(projectionSnapshotBackingAtom)
    const lanes = get(projectionLaneBackingAtom)
    const active = lanes.visibleWindow.active
    // 能被修改结果替换的只有：命令捕获的快照本身；它在途的那次读取落定后的结果（成功或失败）；
    // 之后另一修改发布的同视图结果（Worker 串行应答，先到的修改先发出）。
    // 之后另行发起的读取永远不替换：视图可能已变，应答乱序时它还可能更新。
    const replaceable = current === input.witness ||
      (input.witness.status === 'loading' && current.request === input.witness.request) ||
      (current === get(mutationSnapshotBackingAtom) &&
        sameVisibleView(current.request, input.witness.request))
    if (current.status === 'loading' || active !== null || !replaceable) {
      // 在途读取发出于这次修改之后，会带回它；落定之前已发布结果不再是最新。
      if (active?.publishedCurrent === true) {
        set(projectionLaneBackingAtom, Object.freeze({ ...lanes,
          visibleWindow: Object.freeze({ ...lanes.visibleWindow,
            active: Object.freeze({ ...active, publishedCurrent: false }) }) }))
      }
      return Object.freeze({ status: 'superseded' })
    }

    try {
      const request = freezeProjectionRequest(input.request) as VisibleProjectionRequest
      const result = freezeProjectionResult(input.result) as VisibleProjectionResult
      const validation = validateProjectionResult(result, { request })
      if (!validation.ok) {
        const error = projectionErrorFrom(
          validation.error,
          validation.error.message,
          validation.error.code,
        )
        publish(set, { status: 'error', request, result: current.result, error })
        return Object.freeze({ status: 'rejected', error })
      }
      publish(set, { status: 'ready', request, result, error: undefined })
      applyProjectionSizes(get, set, result)
      if (result.visibility) applySheetVisibility(get, set, result.sheetId, result.visibility)
      recordPublishedGeometry(get, set)
      if (result.protection)
        set(setSheetProtectionAtom, { sheetId: result.sheetId, state: result.protection })
      if (result.calculationMode) set(hydrateCalculationModeAtom, result.calculationMode)
      if (result.iterativeCalculation)
        set(hydrateIterativeCalculationAtom, result.iterativeCalculation)
      const connection = get(rustWorkbookConnectionAtom)
      if (connection && result.customFormulaDefinitions)
        set(hydrateCustomFormulaDefinitionsAtom, {
          connection,
          definitions: result.customFormulaDefinitions,
        })
      void set(syncWatchedCellsAtom)
      return Object.freeze({ status: 'applied' })
    } catch (cause) {
      const error = projectionErrorFrom(cause)
      publish(set, { status: 'error', request: input.request, result: current.result, error })
      return Object.freeze({ status: 'rejected', error })
    }
  },
)
applyVisibleProjectionAtom.debugLabel = 'spreadsheet.projection.applyVisible'
