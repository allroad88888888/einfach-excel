import { atom } from '@einfach/core'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { FORMULA_FUNCTION_SPECS, getFormulaFunctionSpec } from './registry'
import type { FormulaFunctionSpec, NativeFunctionCatalog } from './types'

/** 元数据属于当前二进制连接，不属于工作簿快照；替换/销毁连接后自动不可见。 */
const catalogAtom = atom<{
  connection: RustWorkbookConnection
  catalog: NativeFunctionCatalog
} | null>(null)

export function validateFunctionCatalog(value: NativeFunctionCatalog): NativeFunctionCatalog {
  if (!value || value.version !== 1 || !Array.isArray(value.functions) ||
    !value.functions.length || value.functions.some((item) =>
      !item || typeof item.name !== 'string' || !/^[A-Z][A-Z0-9.]*$/.test(item.name) ||
      typeof item.category !== 'string' || !item.category.trim() ||
      (item.note != null && typeof item.note !== 'string')) ||
    new Set(value.functions.map((item) => item.name)).size !== value.functions.length)
    throw new Error('Rust returned an invalid function catalog.')
  return value
}

export const publishNativeFunctionCatalogAtom = atom(null, (_get, set, input: {
  connection: RustWorkbookConnection
  catalog: NativeFunctionCatalog
}) => set(catalogAtom, { ...input, catalog: validateFunctionCatalog(input.catalog) }))

export const nativeFunctionCatalogAtom = atom((get): readonly FormulaFunctionSpec[] => {
  const saved = get(catalogAtom)
  if (!saved || saved.connection !== get(rustWorkbookConnectionAtom)) return []
  const helpOrder = new Map(FORMULA_FUNCTION_SPECS.map((spec, index) => [spec.name, index]))
  return saved.catalog.functions.map((entry) => {
    const help = getFormulaFunctionSpec(entry.name)
    return { ...entry, args: help?.args ?? [], signatureAvailable: Boolean(help),
      summary: entry.note ?? help?.summary ?? `${entry.category}. Argument help is not available yet.` }
  }).sort((a, b) => (helpOrder.get(a.name) ?? 999) - (helpOrder.get(b.name) ?? 999) ||
    a.name.localeCompare(b.name))
})
