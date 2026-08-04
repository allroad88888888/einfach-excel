/**
 * 数组结果落地前的溢出碰撞闸门。
 *
 * 职责：把 `spill-collision.ts` 的碰撞结论翻成一个 `Value` —— 越界 / 被占给
 * `#SPILL!`，判不动就抛 `NeedsSpillProbes` 向 trampoline 索要那几个候选锚点。
 */
import type { Cell, CellKey, CellRange, Value } from '../types'
import { checkSpillCollision } from './spill-collision'
import { ERR } from './error-value'
import { cellCoordFromKey } from './cell-address'
import { cycleGuardKey } from './cycle-guard'
import type { TrampolineFrame } from './trampoline-ctx'

/**
 * `NeedsDep` 的溢出碰撞版：这一格算出了数组，但要先知道**排在它前面的几个锚点**
 * 摊开成什么形状，才能判自己是不是 `#SPILL!`（见 `spill-collision.ts`）。
 *
 * 与 `NeedsDep` 的唯一区别是多带一个 `tentative`：trampoline 会把它**暂时**写进
 * 缓存再去算候选。原因是候选完全可能回读锚点本身（`A1 = =C1+1` 在本引擎里会广播
 * 成数组，于是 A1 自己也是锚点，而 C1 的碰撞检测要探测 A1）—— 若不给这个暂定值，
 * 候选读到的是「求值中」，`lookupKey` 会把锚点烙成 `#CIRCULAR!`，一条本来好好的
 * 公式就被判了环。候选全部算完后 trampoline 撤掉暂定值、重跑本帧得出真判定。
 *
 * 代价说明白：候选是在「锚点按暂定值溢出」这个假设下算的。若锚点最终判成
 * `#SPILL!`，候选那一轮的缓存值就建立在一个没成立的假设上 —— 窗口只在同一次
 * trampoline 运行内，且要求候选**引用了锚点**。没有为它加清理：清缓存会让候选
 * 重算并再次探测，代价高于这个角落的收益。
 */
export class NeedsSpillProbes {
  constructor(
    readonly deps: ReadonlyArray<TrampolineFrame>,
    readonly tentative: Value,
  ) {}
}

/**
 * 数组结果落地前的最后一关：矩形越界 / 被占 → `#SPILL!`，否则原值放行并把矩形
 * 交回调用方登记运行期依赖。
 *
 * 判定本身（含「阻塞物是别的数组的投影格」那一整类）住在 `spill-collision.ts`；
 * 这里只负责把它的结论翻成 `Value`，以及在需要探测别的锚点时向 trampoline 请求
 * 那几个候选 —— 见 `NeedsSpillProbes`。
 */
export function validateSpillAnchorValue(
  value: Value,
  cells: ReadonlyMap<CellKey, Cell>,
  key: CellKey,
  cache: Map<CellKey, Value>,
  inProgress: Set<CellKey>,
): { readonly value: Value; readonly ranges?: ReadonlyArray<CellRange> } {
  if (value.kind !== 'array') return { value }
  const anchor = cellCoordFromKey(key)
  if (!anchor) return { value }
  const rows = value.value.length
  const cols = value.value[0]?.length ?? 0
  const outcome = checkSpillCollision(anchor, { rows, cols }, cells, key, {
    evaluated: (candidateKey) => cache.get(cycleGuardKey(cells, candidateKey)),
    inFlight: (candidateKey) => inProgress.has(cycleGuardKey(cells, candidateKey)),
  })
  switch (outcome.kind) {
    case 'outOfBounds':
      return { value: ERR('#SPILL!', 'spill range exceeds sheet bounds') }
    case 'blocked':
      return { value: ERR('#SPILL!', outcome.reason), ranges: spillDepRanges(outcome) }
    case 'clear':
      return { value, ranges: spillDepRanges(outcome) }
    case 'pending':
      throw new NeedsSpillProbes(
        outcome.keys.map((candidateKey) => ({
          cells,
          key: candidateKey,
          guardKey: cycleGuardKey(cells, candidateKey),
        })),
        value,
      )
  }
}

/**
 * 锚点这一轮要看住的区域：自己的溢出矩形，加上「可能压过来的那些锚点」的外接
 * 矩形。后者是复活路径的关键 —— 挡住我们的那片数组，它的锚点在我们的矩形**外
 * 面**，清掉它时若没有这条边，被挡的一片永远不会重算。
 */
function spillDepRanges(outcome: {
  readonly range: CellRange
  readonly watch?: CellRange
}): ReadonlyArray<CellRange> {
  return outcome.watch === undefined ? [outcome.range] : [outcome.range, outcome.watch]
}
