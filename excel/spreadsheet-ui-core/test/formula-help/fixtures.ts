import type { NativeFormulaHelp, NativeFunctionCatalog } from '../../src/formula-functions/types'

export function help(names: readonly string[], repeat: NativeFormulaHelp['repeat'] = null): NativeFormulaHelp {
  return { summary: 'Native meaning.', summary_zh: '原生含义。',
    args: names.map((name, index) => ({ name, description: `Meaning of ${name}.`,
      description_zh: `${name} 的含义。`, optional: false,
      repeats: Boolean(repeat && index >= repeat.start && index < repeat.start + repeat.length) })),
    repeat, examples: [], limitations: [] }
}

function withOptional(value: NativeFormulaHelp, names: readonly string[]): NativeFormulaHelp {
  return {
    ...value,
    args: value.args.map((arg) => ({ ...arg, optional: names.includes(arg.name) })),
  }
}

export const HELP_CATALOG: NativeFunctionCatalog = { version: 2, functions: [
  { name: 'LET', category: 'Lambda', help: { ...help(['name', 'value', 'calculation'],
    { start: 0, length: 2, min_groups: 1 }), examples: ['=LET(x,1,x)'] } },
  { name: 'MAP', category: 'Arrays', help: { ...help(['array', 'lambda'],
    { start: 0, length: 1, min_groups: 1 }), examples: ['=MAP({1,2},LAMBDA(x,x))'] } },
  { name: 'SUMIFS', category: 'Math & statistics', help: { ...help(['sum_range', 'criteria_range', 'criteria'],
    { start: 1, length: 2, min_groups: 1 }), examples: ['=SUMIFS({1,2},{1,2},">1")'] } },
  { name: 'LAMBDA', category: 'Lambda', help: { ...withOptional(help(['parameter', 'calculation'],
    { start: 0, length: 1, min_groups: 0 }), ['parameter']), examples: ['=LAMBDA(x,x*2)'] } },
  { name: 'SWITCH', category: 'Logical', help: { ...withOptional(help(['expression', 'case', 'result', 'default'],
    { start: 1, length: 2, min_groups: 1 }), ['default']), examples: ['=SWITCH(1,1,2,3)'] } },
  { name: 'AGGREGATE', category: 'Math & statistics', help: { ...withOptional(help(['function_num', 'options', 'array', 'k'],
    { start: 2, length: 1, min_groups: 1 }), ['k']), examples: ['=AGGREGATE(9,0,A1:A3)'] } },
  { name: 'NORM.S.DIST', category: 'Math & statistics',
    help: { ...help(['z', 'cumulative']), examples: ['=NORM.S.DIST(0,TRUE)'] } },
  { name: 'PI', category: 'Math & statistics', help: { ...help([]), examples: ['=PI()'] } },
] }
