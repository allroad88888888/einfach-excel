import type { FormulaFunctionArg, FormulaFunctionSpec } from '../formula-functions/types'

export interface FormulaArgumentField {
  index: number
  prototypeIndex: number
  groupIndex: number | null
  arg: FormulaFunctionArg
  value: string
}

/** Legacy v1 hosts describe a repeated tail without the v2 group descriptor. */
export function formulaArgumentRepeat(spec: FormulaFunctionSpec) {
  if (spec.repeat) return spec.repeat
  const start = spec.args.findIndex((arg) => arg.repeats)
  return start < 0 ? null : {
    start, length: spec.args.length - start, minGroups: spec.args[start].optional ? 0 : 1,
  }
}

export function formulaArgumentFields(
  spec: FormulaFunctionSpec, groupCount: number, values: readonly string[],
): FormulaArgumentField[] {
  const repeat = formulaArgumentRepeat(spec)
  const fields: FormulaArgumentField[] = []
  const add = (prototypeIndex: number, groupIndex: number | null) => {
    const index = fields.length
    fields.push({ index, prototypeIndex, groupIndex, arg: spec.args[prototypeIndex],
      value: values[index] ?? '' })
  }
  for (let slot = 0; slot < spec.args.length; slot++) {
    if (repeat && slot === repeat.start) {
      for (let group = 0; group < groupCount; group++)
        for (let offset = 0; offset < repeat.length; offset++) add(slot + offset, group)
      slot += repeat.length - 1
    } else add(slot, null)
  }
  return fields
}

/** Fields are complete raw Excel expressions; never split their nested commas or quotes. */
export function buildFormulaArguments(
  spec: FormulaFunctionSpec, groupCount: number, values: readonly string[],
): { formula: string; error: string; errorField: number | null } {
  const repeat = formulaArgumentRepeat(spec)
  const fields = formulaArgumentFields(spec, groupCount, values)
  for (const field of fields) {
    if (field.value.trim() || field.arg.optional) continue
    if (field.groupIndex !== null && repeat?.minGroups === 0) {
      const group = fields.filter((entry) => entry.groupIndex === field.groupIndex)
      if (group.every((entry) => !entry.value.trim())) continue
    }
    return { formula: '', errorField: field.index,
      error: field.groupIndex === null ? 'Enter every required argument.' :
        'Complete every required parameter in each repeated group.' }
  }
  // Optional repeated groups precede a fixed suffix in LAMBDA. Remove only unused trailing
  // groups, so the suffix remains the final expression rather than receiving an empty binding.
  let usedGroups = groupCount
  if (repeat?.minGroups === 0) while (usedGroups > 0) {
    const lastGroup = usedGroups - 1
    if (fields.some((field) => field.groupIndex === lastGroup && field.value.trim())) break
    usedGroups--
  }
  const expressions = fields
    .filter((field) => field.groupIndex === null || field.groupIndex < usedGroups)
    .map((field) => field.value.trim())
  // Only absent optional trailing positions disappear. Empty middle positions retain their commas.
  while (expressions.length && !expressions[expressions.length - 1]) expressions.pop()
  return { formula: `=${spec.name}(${expressions.join(',')})`, error: '', errorField: null }
}
