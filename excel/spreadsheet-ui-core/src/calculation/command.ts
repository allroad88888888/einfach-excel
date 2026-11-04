import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { quickFormulaAvailableAtom } from '../quick-formula/command'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom,
} from '../projection'
import { isProjectionCommandReady } from '../projection/command-ready'
import { validateProjectionResult } from '../projection/contracts'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import {
  DEFAULT_ITERATIVE_CALCULATION,
  calculationModeStateAtom,
  hydrateCalculationModeAtom,
  hydrateIterativeCalculationAtom,
  iterativeCalculationStateAtom,
  normalizeIterativeCalculation,
  validIterativeCalculation,
  type CalculationMode,
  type IterativeCalculationConfig,
} from './mode-state'

export {
  DEFAULT_ITERATIVE_CALCULATION,
  hydrateCalculationModeAtom,
  hydrateIterativeCalculationAtom,
  normalizeIterativeCalculation,
  validIterativeCalculation,
  type CalculationMode,
  type IterativeCalculationConfig,
} from './mode-state'

type Scope = 'sheet' | 'workbook'
const EMPTY = { busy: false, error: null as string | null, message: null as string | null }
const feedbackAtom = atom({ ...EMPTY, connection: null as RustWorkbookConnection | null })
export const calculationFeedbackAtom = atom((get) => {
  const state = get(feedbackAtom)
  return state.connection === get(rustWorkbookConnectionAtom) ? state : EMPTY
})
calculationFeedbackAtom.debugLabel = 'spreadsheet.calculation.feedback'
export const calculationAvailableAtom = atom((get) => {
  const projection = get(projectionSnapshotAtom)
  const feedback = get(feedbackAtom)
  return get(quickFormulaAvailableAtom) && !get(nativeTableFeedbackAtom).busy &&
    !(feedback.connection === get(rustWorkbookConnectionAtom) && feedback.busy) &&
    isProjectionCommandReady(get) &&
    projection.request?.sheetId === get(activeWorkbookSheetAtom)?.id
})
calculationAvailableAtom.debugLabel = 'spreadsheet.calculation.available'

export const calculationModeAtom = atom((get): CalculationMode => {
  const saved = get(calculationModeStateAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (saved && saved.connection === connection) return saved.mode
  const result = get(projectionSnapshotAtom).result
  if (
    result?.kind === 'visible-window' &&
    (result.calculationMode === 'automatic' || result.calculationMode === 'manual')
  ) {
    return result.calculationMode
  }
  return 'automatic'
})
calculationModeAtom.debugLabel = 'spreadsheet.calculation.mode'

export const iterativeCalculationAtom = atom((get): IterativeCalculationConfig => {
  const saved = get(iterativeCalculationStateAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (saved && saved.connection === connection) return saved.config
  const result = get(projectionSnapshotAtom).result
  if (result?.kind === 'visible-window' && validIterativeCalculation(result.iterativeCalculation)) {
    return normalizeIterativeCalculation(result.iterativeCalculation)
  }
  return DEFAULT_ITERATIVE_CALCULATION
})
iterativeCalculationAtom.debugLabel = 'spreadsheet.calculation.iterative'

/** 一次原生重算返回当前投影；没有第二次刷新，也不触碰编辑草稿或历史。 */
export const recalculateAtom = atom(null, async (get, set, scope: Scope): Promise<boolean> => {
  if (!get(calculationAvailableAtom) || !['sheet', 'workbook'].includes(scope)) return false
  const connection = get(rustWorkbookConnectionAtom)!
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (visible?.kind !== 'visible-window') return false
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: visible.sheetId,
    window: visible.window, viewport: visible.viewport, requestId, reason: 'toolbar' })
  const pending = { ...EMPTY, connection, busy: true }
  set(feedbackAtom, pending)
  try {
    const response = connection.request('formula.recalculate', { scope, projection })
    await Promise.resolve()
    if (get(rustWorkbookConnectionAtom) === connection) set(feedbackAtom, pending)
    const result = await response
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    if (!Number.isSafeInteger(result.formulaCount) || result.formulaCount < 0 ||
      !validateProjectionResult(result.projection, { request: projection }).ok)
      throw new Error('Rust returned an invalid calculation result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    set(feedbackAtom, { ...EMPTY, connection,
      message: `${scope === 'sheet' ? 'Worksheet' : 'Workbook'} recalculated (${result.formulaCount} formulas).` })
    return true
  } catch (cause) {
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    set(feedbackAtom, { ...EMPTY, connection,
      error: cause instanceof Error ? cause.message : String(cause) })
    return false
  } finally {
    if (get(feedbackAtom) === pending) set(feedbackAtom, { ...EMPTY, connection })
  }
})
recalculateAtom.debugLabel = 'spreadsheet.calculation.recalculate'

/** 切换工作簿计算模式（Automatic / Manual），随单次投影返回最新求值状态。 */
export const setCalculationModeAtom = atom(
  null,
  async (get, set, mode: CalculationMode): Promise<boolean> => {
    if (!get(calculationAvailableAtom) || !['automatic', 'manual'].includes(mode)) return false
    const connection = get(rustWorkbookConnectionAtom)!
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (visible?.kind !== 'visible-window') return false
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: visible.sheetId,
      window: visible.window,
      viewport: visible.viewport,
      requestId,
      reason: 'toolbar',
    })
    const pending = { ...EMPTY, connection, busy: true }
    set(feedbackAtom, pending)
    try {
      const response = connection.request('formula.setCalculationMode', { mode, projection })
      await Promise.resolve()
      if (get(rustWorkbookConnectionAtom) === connection) set(feedbackAtom, pending)
      const result = await response
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        (result.mode !== 'automatic' && result.mode !== 'manual') ||
        !validateProjectionResult(result.projection, { request: projection }).ok
      ) {
        throw new Error('Rust returned an invalid calculation mode result.')
      }
      set(hydrateCalculationModeAtom, result.mode)
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(feedbackAtom, {
        ...EMPTY,
        connection,
        message: `Calculation mode set to ${result.mode === 'manual' ? 'Manual' : 'Automatic'}.`,
      })
      return true
    } catch (cause) {
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      set(feedbackAtom, {
        ...EMPTY,
        connection,
        error: cause instanceof Error ? cause.message : String(cause),
      })
      return false
    } finally {
      if (get(feedbackAtom) === pending) set(feedbackAtom, { ...EMPTY, connection })
    }
  },
)
setCalculationModeAtom.debugLabel = 'spreadsheet.calculation.setMode'

/** 配置工作簿迭代计算（启用 / 最大迭代次数 / 最大误差），随单次投影返回最新求值状态。 */
export const setIterativeCalculationAtom = atom(
  null,
  async (get, set, input: IterativeCalculationConfig): Promise<boolean> => {
    if (!get(calculationAvailableAtom) || typeof input?.enabled !== 'boolean') return false
    const config = normalizeIterativeCalculation(input)
    const connection = get(rustWorkbookConnectionAtom)!
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (visible?.kind !== 'visible-window') return false
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: visible.sheetId,
      window: visible.window,
      viewport: visible.viewport,
      requestId,
      reason: 'toolbar',
    })
    const pending = { ...EMPTY, connection, busy: true }
    set(feedbackAtom, pending)
    try {
      const response = connection.request('formula.setIterativeCalculation', {
        ...config,
        projection,
      })
      await Promise.resolve()
      if (get(rustWorkbookConnectionAtom) === connection) set(feedbackAtom, pending)
      const result = await response
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        !validIterativeCalculation(result.iterativeCalculation) ||
        !validateProjectionResult(result.projection, { request: projection }).ok
      ) {
        throw new Error('Rust returned an invalid iterative calculation result.')
      }
      set(hydrateIterativeCalculationAtom, result.iterativeCalculation)
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      const resolved = result.iterativeCalculation
      set(feedbackAtom, {
        ...EMPTY,
        connection,
        message: resolved.enabled
          ? `Iterative calculation enabled (max ${resolved.maxIterations} iterations, delta ${resolved.maxChange}).`
          : 'Iterative calculation disabled.',
      })
      return true
    } catch (cause) {
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      set(feedbackAtom, {
        ...EMPTY,
        connection,
        error: cause instanceof Error ? cause.message : String(cause),
      })
      return false
    } finally {
      if (get(feedbackAtom) === pending) set(feedbackAtom, { ...EMPTY, connection })
    }
  },
)
setIterativeCalculationAtom.debugLabel = 'spreadsheet.calculation.setIterative'
