import { atom } from '@einfach/core'
import type { IterativeCalculationConfig } from '../contracts'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'

export type CalculationMode = 'automatic' | 'manual'
export type { IterativeCalculationConfig } from '../contracts'

export const DEFAULT_ITERATIVE_CALCULATION: IterativeCalculationConfig = Object.freeze({
  enabled: false,
  maxIterations: 100,
  maxChange: 0.001,
})

export function validIterativeCalculation(
  value: unknown,
): value is IterativeCalculationConfig {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<IterativeCalculationConfig>
  return (
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.maxIterations === 'number' &&
    Number.isSafeInteger(candidate.maxIterations) &&
    candidate.maxIterations >= 1 &&
    candidate.maxIterations <= 32767 &&
    typeof candidate.maxChange === 'number' &&
    Number.isFinite(candidate.maxChange) &&
    candidate.maxChange >= 0
  )
}

export function normalizeIterativeCalculation(
  input: IterativeCalculationConfig,
): IterativeCalculationConfig {
  const maxIterations = Number.isFinite(input.maxIterations)
    ? Math.min(32767, Math.max(1, Math.trunc(input.maxIterations)))
    : DEFAULT_ITERATIVE_CALCULATION.maxIterations
  const maxChange =
    Number.isFinite(input.maxChange) && input.maxChange >= 0
      ? input.maxChange
      : DEFAULT_ITERATIVE_CALCULATION.maxChange
  return Object.freeze({
    enabled: Boolean(input.enabled),
    maxIterations,
    maxChange,
  })
}

export const calculationModeStateAtom = atom<{
  readonly connection: RustWorkbookConnection | null
  readonly mode: CalculationMode
} | null>(null)
calculationModeStateAtom.debugLabel = 'spreadsheet.calculation.mode.state'

export const hydrateCalculationModeAtom = atom(
  null,
  (get, set, mode: CalculationMode | undefined): void => {
    if (mode !== 'automatic' && mode !== 'manual') return
    const connection = get(rustWorkbookConnectionAtom)
    const saved = get(calculationModeStateAtom)
    if (saved?.connection === connection && saved.mode === mode) return
    set(calculationModeStateAtom, Object.freeze({ connection, mode }))
  },
)
hydrateCalculationModeAtom.debugLabel = 'spreadsheet.calculation.hydrateMode'

export const iterativeCalculationStateAtom = atom<{
  readonly connection: RustWorkbookConnection | null
  readonly config: IterativeCalculationConfig
} | null>(null)
iterativeCalculationStateAtom.debugLabel = 'spreadsheet.calculation.iterative.state'

export const hydrateIterativeCalculationAtom = atom(
  null,
  (get, set, config: IterativeCalculationConfig | undefined): void => {
    if (!validIterativeCalculation(config)) return
    const normalized = normalizeIterativeCalculation(config)
    const connection = get(rustWorkbookConnectionAtom)
    const saved = get(iterativeCalculationStateAtom)
    if (
      saved?.connection === connection &&
      saved.config.enabled === normalized.enabled &&
      saved.config.maxIterations === normalized.maxIterations &&
      saved.config.maxChange === normalized.maxChange
    ) {
      return
    }
    set(iterativeCalculationStateAtom, Object.freeze({ connection, config: normalized }))
  },
)
hydrateIterativeCalculationAtom.debugLabel = 'spreadsheet.calculation.hydrateIterative'
