import { atom } from '@einfach/core'
import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
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
} from './types'
import { applyProjectionSizes } from './projection-sizes'
import { applySheetVisibility } from '../viewport/hidden-state'
import { setSheetProtectionAtom } from '../protection'
import { hydrateCustomFormulaDefinitionsAtom } from '../custom-formulas/expression-catalog'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'

/** Publishes the projection bundled with a mutation without opening a second read lane. */
export const applyVisibleProjectionAtom = atom(
  null,
  (get, set, input: ApplyVisibleProjectionInput): ApplyVisibleProjectionOutcome => {
    const current = get(projectionSnapshotBackingAtom)
    // 命令发送前就在途的读取先完成，不代表用户切换了窗口。
    // 保留同一个 request 身份即可接收随后返回的修改结果；新窗口/切表仍会换 request。
    const previousReadSettled = input.witness.status === 'loading' &&
      current.status === 'ready' && current.request === input.witness.request
    if (
      (current !== input.witness && !previousReadSettled) ||
      current.status === 'loading' ||
      get(projectionLaneBackingAtom).visibleWindow.active !== null
    ) {
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
        set(
          projectionSnapshotBackingAtom,
          freezeProjectionSnapshot({ status: 'error', request, result: current.result, error }),
        )
        return Object.freeze({ status: 'rejected', error })
      }
      set(
        projectionSnapshotBackingAtom,
        freezeProjectionSnapshot({ status: 'ready', request, result, error: undefined }),
      )
      applyProjectionSizes(get, set, result)
      if (result.visibility) applySheetVisibility(get, set, result.sheetId, result.visibility)
      if (result.protection)
        set(setSheetProtectionAtom, { sheetId: result.sheetId, state: result.protection })
      const connection = get(rustWorkbookConnectionAtom)
      if (connection && result.customFormulaDefinitions)
        set(hydrateCustomFormulaDefinitionsAtom, {
          connection,
          definitions: result.customFormulaDefinitions,
        })
      return Object.freeze({ status: 'applied' })
    } catch (cause) {
      const error = projectionErrorFrom(cause)
      set(
        projectionSnapshotBackingAtom,
        freezeProjectionSnapshot({
          status: 'error',
          request: input.request,
          result: current.result,
          error,
        }),
      )
      return Object.freeze({ status: 'rejected', error })
    }
  },
)
applyVisibleProjectionAtom.debugLabel = 'spreadsheet.projection.applyVisible'
