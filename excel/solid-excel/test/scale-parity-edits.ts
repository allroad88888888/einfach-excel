/**
 * scale-parity 的 **P2 编辑序列**：把 `EDIT_SEED` 展开成 200 条编辑，两个引擎
 * 逐条同序施加。
 *
 * 与工作负载分开的理由：工作负载是"导入什么"，编辑序列是"导入之后做什么"——
 * P2 的分歧报告只需要后者的种子。末尾三条溢出区编辑是**固定**的，不吃随机数：
 * 它们是 ADR 0006（溢出区写入语义）的现场，必须每次都跑到。
 */
import { a1, makeRng, rngInt } from './parity-seed'
import { S1_BINOPS, S1_NUMS, S1_TEXTS, S2_NUMS, S2_XSHEET, S3_NUMS } from './scale-parity-workload'

export const EDIT_SEED = 0xed17ed17

export type EditOp =
  | { op: 'setNumber'; sheet: number; addr: string; value: number }
  | { op: 'setText'; sheet: number; addr: string; value: string }
  | { op: 'clearCell'; sheet: number; addr: string }
  | { op: 'setFormula'; sheet: number; addr: string; formula: string }

export function buildEdits(): EditOp[] {
  const rng = makeRng(EDIT_SEED)
  const ops: EditOp[] = []
  for (let i = 0; i < 197; i += 1) {
    const k = rng()
    if (k < 0.4) {
      // Overwrite a seeded number (keeps the Sheet1 A-column cell COUNT
      // stable — the P4 closed form depends on it).
      const sheet = rngInt(rng, 3)
      const bound = sheet === 0 ? S1_NUMS : sheet === 1 ? S2_NUMS : S3_NUMS
      ops.push({
        op: 'setNumber',
        sheet,
        addr: a1(rngInt(rng, bound), 0),
        value: rngInt(rng, 5000),
      })
    } else if (k < 0.55) {
      ops.push({
        op: 'setText',
        sheet: 0,
        addr: a1(rngInt(rng, S1_TEXTS), 1),
        value: `edit${i}-${rngInt(rng, 100)}`,
      })
    } else if (k < 0.7) {
      ops.push({ op: 'clearCell', sheet: 0, addr: a1(rngInt(rng, S1_BINOPS - 10), 3) })
    } else if (k < 0.9) {
      const r = rngInt(rng, S1_NUMS)
      ops.push({
        op: 'setFormula',
        sheet: 0,
        addr: a1(rngInt(rng, S1_BINOPS - 10), 3),
        formula: `=${a1(r, 0)}*3+1`,
      })
    } else {
      const r = rngInt(rng, S3_NUMS)
      ops.push({
        op: 'setFormula',
        sheet: 1,
        addr: a1(rngInt(rng, S2_XSHEET), 1),
        formula: `=Sheet3!${a1(r, 0)}+${rngInt(rng, 100)}`,
      })
    }
  }
  // Spill-region edits (fixed, deterministic): a literal into a spill
  // target, a formula overwrite into a spill target, and an anchor clear.
  ops.push({ op: 'setNumber', sheet: 0, addr: 'H3', value: 999 }) // into Sheet1!H1 spill
  ops.push({ op: 'setFormula', sheet: 0, addr: 'K2', formula: '=1+1' }) // into Sheet1!J1 spill
  ops.push({ op: 'clearCell', sheet: 1, addr: 'D1' }) // tear down Sheet2!D1 anchor
  return ops
}
