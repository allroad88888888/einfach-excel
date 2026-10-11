import type { FormulaFunctionSpec } from './types'

/** 完全匹配、前缀、子串依次排序；同级保留调用方的常用／字母顺序。 */
export function searchFormulaFunctions(
  fragment: string, specs: readonly FormulaFunctionSpec[], limit = Infinity,
): FormulaFunctionSpec[] {
  const upper = fragment.toUpperCase()
  const startsWith: FormulaFunctionSpec[] = []
  const contains: FormulaFunctionSpec[] = []
  for (const spec of specs) {
    if (spec.name === upper) startsWith.unshift(spec)
    else if (spec.name.startsWith(upper)) startsWith.push(spec)
    else if (spec.name.includes(upper)) contains.push(spec)
  }
  return [...startsWith, ...contains].slice(0, limit)
}
