/**
 * 跨格求值的显式工作栈。
 *
 * 职责：把「算出 `rootKey` 这一格的值」这件事，用一个显式的工作栈跑完，而不是
 * 靠 JS 调用栈递归下去。
 *
 * 这里只留状态机本体：工作栈、缓存与 `inProgress` 集合、两种中断信号各自的重试
 * 规则 —— 同一段控制流不再往外拆，否则「在哪抛、在哪接、接住之后栈怎么变」会散
 * 到三个文件里。抛信号的两侧已各自成文件：`trampoline-ctx.ts`（shim ctx）与
 * `spill-anchor-gate.ts`（溢出碰撞闸门）。
 */
import type { Cell, CellKey, EvalContext, Expr, Value } from '../types'
import { BLANK } from '../types'
import { ERR } from './error-value'
import { cycleGuardKey } from './cycle-guard'
import { createSpillProjectionRun } from './spill-projection-run'
import type { SpillAnchorSource } from './spill-projection'
import { makeTrampolineCtx, NeedsDep, type TrampolineFrame } from './trampoline-ctx'
import { NeedsSpillProbes, validateSpillAnchorValue } from './spill-anchor-gate'

// ----------------------------------------------------------------------------
// Trampolined per-cell evaluation (Chain-eval fix).
//
// Goal: evaluate the formula at `rootKey` against `rootCells` without
// blowing V8's ~1 MB call stack on deep cross-cell dependency chains
// (e.g. `A2=A1+1, A3=A2+1, …, A1000=A999+1`).
//
// Strategy (Option B from the bug report): keep an explicit work stack
// of cells to resolve. When the in-flight evaluation of a cell's AST
// reaches a `ref` / `range` / `crossSheet` whose value is not yet in the
// `cache`, throw a `NeedsDep` sentinel. The trampoline catches it,
// pushes the missing deps onto the work stack, and re-attempts the
// current cell on the next iteration once those deps have been
// resolved. Each cell's AST is evaluated at most `1 + (# of distinct
// refs it depends on)` times in the worst case; for the canonical
// `=A(n-1)+1` chain that's 2 evaluations per cell.
//
// AST traversal inside a single cell still uses the existing recursive
// `evaluate`, but since AST depth is bounded by formula complexity (not
// chain length), it never touches the deep-recursion ceiling. The
// trampoline only flattens the *cross-cell* recursion that was the
// source of the stack overflow.
//
// Cycle detection moves from `currentlyEvaluating` (the set passed
// through nested `evaluate` calls) to the trampoline's `inProgress`
// set, keyed by the same `cycleGuardKey(cells, key)` so cross-sheet
// chains remain disjoint. A cycle is detected when a `refLookup` hits a
// dep whose guard key is already in `inProgress` — that dep is stamped
// `#CIRCULAR!` in the cache and short-circuits future lookups.
//
// Crucially, dep discovery is *lazy* — we throw on the first missing
// dep encountered during AST walk, not by pre-walking the AST to
// collect every reference. This preserves `IF`'s short-circuit
// semantics: a `=IF(TRUE, 0, A1)` cell will never request `A1` because
// the AST walk never reaches the else branch. Pre-walking would
// regress that.
// ----------------------------------------------------------------------------

/**
 * 单格 AST 的递归求值器。作为参数传进来，而不是
 * `import { evaluate } from './evaluate'` —— 后者会让本文件与求值器互相 import
 * 成环。工作栈只要「把一棵 AST 在给定 ctx 上算成值」这一个能力，参数化掉它，
 * 本文件就成了求值器的下游叶子。
 */
export type EvaluateExpr = (ast: Expr, ctx: EvalContext) => Value

/**
 * Public entry: evaluate the cell at `rootKey` inside `rootCells` to a
 * concrete `Value`. The trampoline removes the cross-cell recursion
 * that previously blew V8's stack on deep dependency chains.
 *
 * If `rootKey` does not exist in `rootCells`, returns `BLANK` (Excel
 * convention). If the cell exists but has no AST, returns the stored
 * literal value verbatim — no trampoline machinery is involved in that
 * common case.
 *
 * `hostCtx` provides the host-level pieces the trampoline can't
 * synthesize: `crossSheetCells`, `callCustom`, `resolveName`, and the
 * shared `currentlyEvaluating` set (kept for back-compat, though cycle
 * detection is driven by `inProgress` internally).
 */
export function evaluateCellTrampolined(
  rootKey: CellKey,
  rootCells: ReadonlyMap<CellKey, Cell>,
  hostCtx: EvalContext,
  evaluate: EvaluateExpr,
): Value {
  const rootCell = rootCells.get(rootKey)
  if (!rootCell) return BLANK
  if (!rootCell.ast) return rootCell.value

  const cache = new Map<CellKey, Value>()
  // `inProgress` marks cells whose AST is currently mid-walk (started
  // evaluating but waiting on deps before it can finish). A cycle is
  // detected when `refLookup` hits a dep already in `inProgress`.
  //
  // Subtle: cells that have been *pushed* onto the work stack but not
  // yet started must NOT be in `inProgress`. Otherwise, when a single
  // range-lookup batch (`SUM(B1:B100)`) pushes 99 deps at once, every
  // pair within that batch would mark each other as in-progress and
  // false-positive a cycle. Membership in `inProgress` is bound to
  // "AST eval has started but not finished for this guard key."
  //
  // We do NOT maintain a separate `queued` "already pushed" set. An
  // earlier revision tried to skip re-pushing deps already on the
  // stack, but that broke a corner case: when a range batch like
  // `=SUM(B1:B3)` with `B1=B2+1, B2=B3+1, B3=1` pre-pushes [B3, B2, B1]
  // (B1 on top), B1's AST walk faults on B2 — which is queued lower on
  // the stack but hasn't started yet. Short-circuiting the re-push left
  // B1 stuck on top, retrying forever until `maxIter`. The correctness
  // invariant is the cache check at the top of the loop: re-pushing a
  // dep that's already in the stack costs O(1) per duplicate pop (the
  // cache-hit branch immediately drops it), and the duplicate count is
  // bounded by the number of distinct refs in each in-flight cell's
  // AST — not by chain depth.
  const inProgress = new Set<CellKey>()
  const stack: TrampolineFrame[] = []
  // 溢出碰撞探测期间被塞了「暂定数组值」的锚点（见 `NeedsSpillProbes`）。候选全部
  // 算完、本帧重回栈顶时撤掉它，让本帧重跑一次得出真判定。
  const spillProbeSeeds = new Set<CellKey>()

  // 本轮的溢出投影账本。候选锚点的值走同一个 `cache`：已经算过的直接用，没算过
  // 的攒起来在扫描收尾时一次性抛给 trampoline（与区域物化的批量 `NeedsDep` 同
  // 形，避免每个候选各中断一次）。
  let pendingAnchors: TrampolineFrame[] = []
  let skippedInFlight = false
  const spill = createSpillProjectionRun({
    cellsFor: (sheetName) =>
      sheetName === undefined ? rootCells : hostCtx.crossSheetCells(sheetName),
    sourceFor: (target): SpillAnchorSource => {
      pendingAnchors = []
      skippedInFlight = false
      return {
        arrayAt: (key, cell) => {
          if (cell.ast === undefined) {
            return cell.value.kind === 'array' ? cell.value.value : undefined
          }
          const guardKey = cycleGuardKey(target, key)
          const cached = cache.get(guardKey)
          if (cached !== undefined) return cached.kind === 'array' ? cached.value : undefined
          // 候选正在求值栈上 —— 它在读我们，不能反过来向它索赔（`lookupKey`
          // 会把它烙成 `#CIRCULAR!`，一条本来好好的公式就被判了环）。
          if (inProgress.has(guardKey)) {
            skippedInFlight = true
            return undefined
          }
          pendingAnchors.push({ cells: target, key, guardKey })
          return undefined
        },
        settle: () => {
          if (pendingAnchors.length > 0) throw new NeedsDep(pendingAnchors)
        },
        unstable: () => skippedInFlight,
      }
    },
  })

  const rootGuard = cycleGuardKey(rootCells, rootKey)
  if (hostCtx.currentlyEvaluating.has(rootGuard)) return ERR('#CIRCULAR!')
  hostCtx.currentlyEvaluating.add(rootGuard)

  // Bound on iterations as a defense against accidental infinite
  // re-trying. Worst case the trampoline visits each cell `1 + deps`
  // times; for a 100k chain with single-ref formulas that's 2*100k =
  // 200k. Use a 10× margin (2M iterations) before bailing with a
  // diagnostic error — anything past that signals a logic bug in the
  // sentinel-retry loop, not a legitimate workload.
  const maxIter = 20_000_000
  let iter = 0

  stack.push({ cells: rootCells, key: rootKey, guardKey: rootGuard })

  try {
  while (stack.length > 0) {
    iter += 1
    if (iter > maxIter) {
      return ERR(
        '#NUM!',
        `evaluateCellTrampolined exceeded ${maxIter} work-stack iterations (possible logic bug)`,
      )
    }
    const top = stack[stack.length - 1]
    if (spillProbeSeeds.delete(top.guardKey)) {
      // 候选锚点的帧都压在本帧之上，此刻已全部出栈 —— 撤掉暂定值，下面重跑一次
      // AST + 碰撞判定，这一次候选的形状都在缓存里了。
      cache.delete(top.guardKey)
    } else if (cache.has(top.guardKey)) {
      inProgress.delete(top.guardKey)
      stack.pop()
      // Lazy dep install for frames whose value was cached OUT FROM
      // UNDER them by cycle detection: when `refLookup` / `rangeLookup`
      // hits an in-progress ancestor it stamps that ancestor's cache
      // entry with #CIRCULAR!, so the ancestor's frame lands here and
      // never reaches the post-`evaluate` hook below. Without this, a
      // cycle member's reverse edges are missing and breaking the cycle
      // never re-derives it (codex P1 #2). Repeat pops of duplicate
      // frames are O(1): `installDepsFor` skips when the AST identity
      // and names revision are unchanged.
      if (hostCtx.onFormulaEvaluated) {
        const cachedCell = top.cells.get(top.key)
        if (cachedCell?.ast) hostCtx.onFormulaEvaluated(top.cells, top.key, cachedCell.ast)
      }
      continue
    }
    const cell = top.cells.get(top.key)
    if (!cell) {
      cache.set(top.guardKey, BLANK)
      inProgress.delete(top.guardKey)
      stack.pop()
      continue
    }
    if (!cell.ast) {
      cache.set(top.guardKey, cell.value)
      inProgress.delete(top.guardKey)
      stack.pop()
      continue
    }
    // About to start (or resume) walking this cell's AST — mark
    // inProgress so a back-edge through this guard key surfaces
    // #CIRCULAR! instead of falling into infinite re-trying.
    inProgress.add(top.guardKey)
    const shimCtx = makeTrampolineCtx(top.cells, top.key, hostCtx, cache, inProgress, spill)
    // 本帧重跑时上一轮攒的 watch 作废 —— 每次都从这一帧真正问过的候选重新收。
    spill.resetWatches()
    try {
      const result = validateSpillAnchorValue(
        evaluate(cell.ast, shimCtx),
        top.cells,
        top.key,
        cache,
        inProgress,
      )
      cache.set(top.guardKey, result.value)
      inProgress.delete(top.guardKey)
      stack.pop()
      // Lazy dep install (KEY_GRANULAR_INVALIDATION): every formula the
      // trampoline finishes — the root anchor AND transitively-visited
      // dependency cells — reports to the workbook so its reverse edges
      // exist before any of its dependents cache a value derived from it.
      hostCtx.onFormulaEvaluated?.(top.cells, top.key, cell.ast, {
        ranges: [
          ...(result.ranges ?? []).map((range) => ({ range })),
          // 读到过投影值的公式必须依赖那些**锚点**：它的静态依赖指向投影格自己，
          // 而投影格在表里没有条目 —— 锚点重算 / 被清掉时没有任何一条现成的边
          // 会通知它。收成外接矩形（区域依赖），不逐格登记。
          ...spill.watches().map((watch) => ({ sheetName: watch.sheetName, range: watch.range })),
        ],
      })
    } catch (err) {
      if (err instanceof NeedsSpillProbes) {
        // 这一格算出了数组，但要先知道排在它前面的几个锚点摊开成什么形状。把暂定
        // 数组值写进缓存再去算候选 —— 候选若回读本格（`=C1+1` 这类），读到的是这个
        // 暂定值而不是「求值中」，否则 `lookupKey` 会把本格烙成 `#CIRCULAR!`。
        cache.set(top.guardKey, err.tentative)
        spillProbeSeeds.add(top.guardKey)
        for (let i = err.deps.length - 1; i >= 0; i -= 1) {
          const dep = err.deps[i]
          if (cache.has(dep.guardKey)) continue
          stack.push({ cells: dep.cells, key: dep.key, guardKey: dep.guardKey })
        }
        continue
      }
      if (err instanceof NeedsDep) {
        // The cell isn't done — it faulted out partway through AST
        // evaluation when it hit a dep that wasn't in the cache yet.
        // Leave it in `inProgress` (it's a paused ancestor whose work
        // depends on the deps about to be pushed); when one of those
        // deps tries to refer back to us, the refLookup shim will
        // surface #CIRCULAR! against this still-in-progress entry.
        // Push deps in *reverse* iteration order so the first dep in
        // `err.deps` ends up on TOP of the stack (LIFO → processed
        // next). This matters for range batches whose deps form a
        // chain: `SUM(B1:B100)` with `B(k)=B(k-1)+1` lists deps as
        // [B2, B3, …, B100]; to evaluate them bottom-up we want B2
        // popped first, so push B100 first and B2 last.
        //
        // We deliberately do NOT skip deps already on the stack — see
        // the comment near `inProgress` for the corner case (range
        // batch faulting on a queued-but-not-started dep). Duplicates
        // are O(1) at pop time via the cache-hit branch.
        for (let i = err.deps.length - 1; i >= 0; i -= 1) {
          const dep = err.deps[i]
          if (cache.has(dep.guardKey)) continue
          stack.push({ cells: dep.cells, key: dep.key, guardKey: dep.guardKey })
        }
        // Loop continues; the newly-pushed deps will be evaluated
        // first, and `top` will be retried once they cache out.
        continue
      }
      // Any other throw is a real bug — surface it.
      inProgress.delete(top.guardKey)
      throw err
    }
  }

  return cache.get(rootGuard) ?? BLANK
  } finally {
    hostCtx.currentlyEvaluating.delete(rootGuard)
  }
}
