import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { FormulaFunctionSpec } from '../formula-functions/types'
import { validateCustomFormulaDefinitions, type NativeCustomFormulaDefinition } from './expression-types'

const directoryAtom = atom<{
  connection: RustWorkbookConnection
  definitions: readonly NativeCustomFormulaDefinition[]
} | null>(null)
const EMPTY_DEFINITIONS: readonly NativeCustomFormulaDefinition[] = Object.freeze([])

function sameDefinitions(
  left: readonly NativeCustomFormulaDefinition[],
  right: readonly NativeCustomFormulaDefinition[],
): boolean {
  return (
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index]
      return (
        !!other &&
        Array.isArray(other.parameters) &&
        entry.name === other.name &&
        entry.expression === other.expression &&
        entry.parameters.length === other.parameters.length &&
        entry.parameters.every((parameter, slot) => parameter === other.parameters[slot])
      )
    })
  )
}

/** Called by native projection hydration, file open and history replay. */
export const hydrateCustomFormulaDefinitionsAtom = atom(
  null,
  (
    get,
    set,
    input: {
      connection: RustWorkbookConnection
      definitions: readonly NativeCustomFormulaDefinition[]
    },
  ) => {
    const saved = get(directoryAtom)
    if (
      saved?.connection === input.connection &&
      sameDefinitions(saved.definitions, input.definitions)
    )
      return
    set(directoryAtom, {
      ...input,
      definitions: validateCustomFormulaDefinitions(input.definitions),
    })
  },
)

export const nativeCustomFormulaDefinitionsAtom = atom((get) => {
  const saved = get(directoryAtom)
  return saved?.connection === get(rustWorkbookConnectionAtom)
    ? saved.definitions
    : EMPTY_DEFINITIONS
})

/** Help is projected from native parameter names, never inferred from a JS body. */
export const customFormulaFunctionSpecsAtom = atom((get): readonly FormulaFunctionSpec[] =>
  get(nativeCustomFormulaDefinitionsAtom).map(definition => ({
    name: definition.name, args: definition.parameters.map(name => ({ name })),
    category: 'Custom', signatureAvailable: true, summary: definition.expression,
  })))
