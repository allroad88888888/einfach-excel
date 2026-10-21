import type { FormulaFunctionSpec } from '../types'

/** Resolve repeated groups before fixed suffix parameters using the real call size. */
export function formulaHelpArgumentIndex(
  spec: FormulaFunctionSpec, actualIndex: number, argumentCount: number, firstArgument?: string,
): number {
  if (!spec.args.length || actualIndex < 0) return -1
  const group = spec.repeat
  if (!group) {
    const legacyTail = spec.args.findIndex((arg) => arg.repeats)
    return actualIndex < spec.args.length ? actualIndex : legacyTail
  }
  if (actualIndex < group.start) return actualIndex
  const suffixStart = group.start + group.length
  const suffix = spec.args.slice(suffixStart)
  let requiredSuffix = suffix.filter((arg) => !arg.optional).length
  if (spec.name === 'AGGREGATE') {
    // Its final k exists only for codes 14–19. Do not evaluate references or
    // expressions in input assistance; an unknown code's final role is ambiguous.
    const literal = firstArgument?.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i)
    const code = literal ? Math.trunc(Number(literal[0])) : null
    if (code === null && actualIndex === argumentCount - 1 && actualIndex > group.start) return -1
    requiredSuffix = code !== null && code >= 14 && code <= 19 ? 1 : 0
  }
  const available = Math.max(0, argumentCount - group.start - requiredSuffix)
  // With a required suffix, a trailing comma proves the preceding argument is
  // a repeated name, not LET's final body: keep its unfinished value slot.
  const round = requiredSuffix > 0 ? Math.ceil : Math.floor
  const groups = Math.max(group.minGroups, round(available / group.length))
  const groupEnd = group.start + groups * group.length
  if (actualIndex < groupEnd) return group.start + (actualIndex - group.start) % group.length
  const suffixIndex = actualIndex - groupEnd
  if (suffixIndex < suffix.length) return suffixStart + suffixIndex
  // While typing an unfinished pair, retain that pair's actual parameter role.
  if (!suffix.length) return group.start + (actualIndex - group.start) % group.length
  return -1
}

/** Render one repeated prototype as a group, retaining optional members and suffix. */
export function formulaHelpSignatureSlots(spec: FormulaFunctionSpec): string[] {
  const group = spec.repeat
  return spec.args.map((arg, index) => {
    const repeated = group && index >= group.start && index < group.start + group.length
    if (!repeated) {
      const tail = !group && arg.repeats ? `${arg.name}, ...` : arg.name
      return arg.optional ? `[${tail}]` : tail
    }
    const start = index === group.start
    const end = index === group.start + group.length - 1
    // A group is repeated together, never separate range..., criteria... lists.
    const member = arg.optional && group.minGroups > 0 ? `[${arg.name}]` : arg.name
    return `${start ? (group.minGroups === 0 ? '[' : '(') : ''}${member}${end
      ? (group.minGroups === 0 ? ', ...]' : '), ...') : ''}`
  })
}
