/**
 * Built-in formula function registry.
 *
 * Each Wave C track owns one file in this directory; each file exports a
 * `FUNCTIONS: Record<string, FunctionImpl>` keyed by uppercase function
 * name. This barrel merges them all into a single lookup table the
 * evaluator dispatches against.
 *
 * Adding a new function (Wave F+):
 *   1. Implement the `FunctionImpl` inside the appropriate category file.
 *   2. Add it to that file's `FUNCTIONS` export.
 *   3. The merge below picks it up automatically — no edit here.
 *
 * Adding a new category file:
 *   1. Create `<category>.ts` exporting `FUNCTIONS`.
 *   2. Add a spread entry to the merge below.
 *
 * Name collisions across files are a build-time bug — declared via the
 * jest test in `test/functions-registry.test.ts` so we catch them early.
 */
import type { FunctionImpl } from '../../types'

import { FUNCTIONS as ARRAY_FUNCTIONS } from './array'
import { FUNCTIONS as DATABASE_FUNCTIONS } from './database'
import { FUNCTIONS as DATE_FUNCTIONS } from './date'
import { FUNCTIONS as ENGINEERING_FUNCTIONS } from './engineering'
import { FUNCTIONS as FINANCIAL_FUNCTIONS } from './financial'
import { FUNCTIONS as INFO_FUNCTIONS } from './info'
import { FUNCTIONS as LOGICAL_FUNCTIONS } from './logical'
import { FUNCTIONS as LOOKUP_FUNCTIONS } from './lookup'
import { FUNCTIONS as MATH_FUNCTIONS } from './math'
import { FUNCTIONS as STATS_FUNCTIONS } from './stats'
import { FUNCTIONS as TEXT_FUNCTIONS } from './text'

const evaluatorAwareOnly: FunctionImpl = () => ({
  kind: 'error',
  code: '#VALUE!',
  message: 'function requires evaluator-aware dispatch',
})

const EVALUATOR_AWARE_FUNCTIONS: Record<string, FunctionImpl> = {
  LET: evaluatorAwareOnly,
  LAMBDA: evaluatorAwareOnly,
  ISOMITTED: evaluatorAwareOnly,
  MAP: evaluatorAwareOnly,
  REDUCE: evaluatorAwareOnly,
  SCAN: evaluatorAwareOnly,
  BYROW: evaluatorAwareOnly,
  BYCOL: evaluatorAwareOnly,
  MAKEARRAY: evaluatorAwareOnly,
  SHEET: evaluatorAwareOnly,
  SHEETS: evaluatorAwareOnly,
  AREAS: evaluatorAwareOnly,
  FORMULATEXT: evaluatorAwareOnly,
  CELL: evaluatorAwareOnly,
  INDIRECT: evaluatorAwareOnly,
  OFFSET: evaluatorAwareOnly,
}

/**
 * The canonical name→impl map the evaluator dispatches against. Keys are
 * uppercase (lookups happen via `name.toUpperCase()`). Frozen so the
 * registry can't be mutated post-init.
 */
export const BUILTIN_FUNCTIONS: ReadonlyMap<string, FunctionImpl> = Object.freeze(
  new Map<string, FunctionImpl>([
    ...Object.entries(MATH_FUNCTIONS),
    ...Object.entries(LOGICAL_FUNCTIONS),
    ...Object.entries(LOOKUP_FUNCTIONS),
    ...Object.entries(TEXT_FUNCTIONS),
    ...Object.entries(DATE_FUNCTIONS),
    ...Object.entries(STATS_FUNCTIONS),
    ...Object.entries(ARRAY_FUNCTIONS),
    ...Object.entries(INFO_FUNCTIONS),
    ...Object.entries(FINANCIAL_FUNCTIONS),
    ...Object.entries(ENGINEERING_FUNCTIONS),
    ...Object.entries(DATABASE_FUNCTIONS),
    ...Object.entries(EVALUATOR_AWARE_FUNCTIONS),
  ]),
)

/**
 * Lookup helper — case-insensitive. Returns `undefined` if the name is
 * not a known built-in; the evaluator then falls through to custom
 * formula dispatch (Wave E/E4), then to `#NAME?`.
 */
export function getBuiltinFunction(name: string): FunctionImpl | undefined {
  return BUILTIN_FUNCTIONS.get(name.toUpperCase())
}

/**
 * Full list of built-in names, sorted for determinism.
 *
 * 这里曾写着「被 `excel/spreadsheet-ui-core` 的公式自动补全用来遮蔽冲突的自定义公式
 * 注册」—— 那是假的，从来没有生产消费者。注册侧的遮蔽名单是
 * `ENGINE_BUILTIN_FORMULA_NAMES`（Rust 侧 `is_builtin_function_name` 的镜像），
 * **刻意**不是这份：两个后端可互换，而拒绝规则必须只有一份、且以引擎为准。
 *
 * 现在它是测试专用的抽取口，供
 * `excel/solid-excel/test/engine-function-set-parity.test.ts` 与本包的
 * `test/functions-registry.test.ts` 拿到 TS 侧的真实名字集合。
 */
export function listBuiltinNames(): readonly string[] {
  return Object.freeze([...BUILTIN_FUNCTIONS.keys()].sort())
}
