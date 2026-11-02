import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import type { FormulaEvalStepSnapshot, FormulaEvaluationTraceSnapshot } from './types'

export interface EvaluateFormulaFrame {
  readonly trace: FormulaEvaluationTraceSnapshot
  readonly stepIndex: number
}

export interface EvaluateFormulaDialogState {
  readonly open: boolean
  readonly busy: boolean
  readonly error?: string
  readonly trace: FormulaEvaluationTraceSnapshot | null
  readonly stepIndex: number
  readonly stack: readonly EvaluateFormulaFrame[]
}

export interface EvaluateFormulaViewState extends EvaluateFormulaDialogState {
  readonly currentExpression: string
  readonly focusSpan: { readonly start: number; readonly end: number } | null
  readonly currentStep: FormulaEvalStepSnapshot | null
  readonly isFinished: boolean
  readonly canEvaluate: boolean
  readonly canStepIn: boolean
  readonly canStepOut: boolean
}

const INITIAL_EVALUATE_STATE: EvaluateFormulaDialogState = Object.freeze({
  open: false,
  busy: false,
  trace: null,
  stepIndex: 0,
  stack: Object.freeze([]),
})

const evaluateFormulaBackingAtom = atom<EvaluateFormulaDialogState>(INITIAL_EVALUATE_STATE)
evaluateFormulaBackingAtom.debugLabel = 'spreadsheet.formulaAuditing.evaluateBacking'

export const evaluateFormulaDialogAtom = atom((get): EvaluateFormulaViewState => {
  const state = get(evaluateFormulaBackingAtom)
  const trace = state.trace
  if (!trace) {
    return Object.freeze({
      ...state,
      currentExpression: '',
      focusSpan: null,
      currentStep: null,
      isFinished: false,
      canEvaluate: false,
      canStepIn: false,
      canStepOut: state.stack.length > 0,
    })
  }
  const steps = trace.steps
  const isFinished = steps.length === 0 || state.stepIndex >= steps.length
  const currentStep = !isFinished ? (steps[state.stepIndex] ?? null) : null
  const currentExpression = currentStep
    ? currentStep.expressionBefore
    : steps.length > 0
      ? steps[steps.length - 1]!.expressionAfter
      : trace.formula || trace.finalResult
  const focusSpan =
    currentStep && currentStep.focusEnd > currentStep.focusStart
      ? Object.freeze({ start: currentStep.focusStart, end: currentStep.focusEnd })
      : null

  return Object.freeze({
    ...state,
    currentExpression,
    focusSpan,
    currentStep,
    isFinished,
    canEvaluate: !state.busy && steps.length > 0 && !isFinished,
    canStepIn: !state.busy && Boolean(currentStep?.stepInTarget),
    canStepOut: !state.busy && state.stack.length > 0,
  })
})
evaluateFormulaDialogAtom.debugLabel = 'spreadsheet.formulaAuditing.evaluateDialog'

export type EvaluateFormulaAction =
  | 'open'
  | 'close'
  | 'evaluate'
  | 'step-in'
  | 'step-out'
  | 'restart'

export const runEvaluateFormulaAtom = atom(
  null,
  async (get, set, action: EvaluateFormulaAction): Promise<boolean> => {
    if (action === 'close') {
      set(evaluateFormulaBackingAtom, INITIAL_EVALUATE_STATE)
      return true
    }

    const current = get(evaluateFormulaBackingAtom)
    if (current.busy) return false

    if (action === 'evaluate') {
      if (!current.open || !current.trace) return false
      const stepCount = current.trace.steps.length
      if (stepCount === 0) return false
      const nextIndex = current.stepIndex < stepCount ? current.stepIndex + 1 : 0
      set(
        evaluateFormulaBackingAtom,
        Object.freeze({
          ...current,
          stepIndex: nextIndex,
          error: undefined,
        }),
      )
      return true
    }

    if (action === 'restart') {
      if (!current.open || !current.trace) return false
      const rootTrace = current.stack.length > 0 ? current.stack[0]!.trace : current.trace
      set(
        evaluateFormulaBackingAtom,
        Object.freeze({
          ...current,
          trace: rootTrace,
          stepIndex: 0,
          stack: Object.freeze([]),
          error: undefined,
        }),
      )
      return true
    }

    if (action === 'step-out') {
      if (!current.open || current.stack.length === 0) return false
      const parent = current.stack[current.stack.length - 1]!
      const nextStack = current.stack.slice(0, -1)
      const nextIndex = Math.min(parent.stepIndex + 1, parent.trace.steps.length)
      set(
        evaluateFormulaBackingAtom,
        Object.freeze({
          ...current,
          trace: parent.trace,
          stepIndex: nextIndex,
          stack: Object.freeze(nextStack),
          error: undefined,
        }),
      )
      return true
    }

    const connection = get(rustWorkbookConnectionAtom)
    const activeSheet = get(activeWorkbookSheetAtom)
    if (!connection || !activeSheet) return false

    if (action === 'step-in') {
      if (!current.open || !current.trace) return false
      const step = current.trace.steps[current.stepIndex]
      const target = step?.stepInTarget
      if (!target || !target.sheetId) return false

      set(evaluateFormulaBackingAtom, Object.freeze({ ...current, busy: true, error: undefined }))
      try {
        const nextTrace = await connection.request('formulaAuditing.evaluate', {
          sheetId: target.sheetId,
          row: target.row,
          col: target.col,
        })
        const latest = get(evaluateFormulaBackingAtom)
        if (!latest.open || !latest.trace) return false
        set(
          evaluateFormulaBackingAtom,
          Object.freeze({
            open: true,
            busy: false,
            trace: nextTrace,
            stepIndex: 0,
            stack: Object.freeze([
              ...latest.stack,
              Object.freeze({ trace: latest.trace, stepIndex: latest.stepIndex }),
            ]),
          }),
        )
        return true
      } catch (error) {
        const latest = get(evaluateFormulaBackingAtom)
        set(
          evaluateFormulaBackingAtom,
          Object.freeze({
            ...latest,
            busy: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        return false
      }
    }

    // action === 'open'
    const activeCell = get(selectionSnapshotAtom).activeCell
    set(
      evaluateFormulaBackingAtom,
      Object.freeze({
        open: true,
        busy: true,
        trace: current.trace,
        stepIndex: 0,
        stack: Object.freeze([]),
        error: undefined,
      }),
    )

    try {
      const trace = await connection.request('formulaAuditing.evaluate', {
        sheetId: activeSheet.id,
        row: activeCell.row,
        col: activeCell.col,
      })
      set(
        evaluateFormulaBackingAtom,
        Object.freeze({
          open: true,
          busy: false,
          trace,
          stepIndex: 0,
          stack: Object.freeze([]),
        }),
      )
      return true
    } catch (error) {
      set(
        evaluateFormulaBackingAtom,
        Object.freeze({
          open: true,
          busy: false,
          trace: null,
          stepIndex: 0,
          stack: Object.freeze([]),
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      return false
    }
  },
)
runEvaluateFormulaAtom.debugLabel = 'spreadsheet.formulaAuditing.runEvaluateFormula'
