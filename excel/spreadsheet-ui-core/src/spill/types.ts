import type { CellCoord, CellRange, SheetRef } from '../shared'

/**
 * 一次溢出区查询：问「(row, col) 这一格属不属于某个活动的动态数组」。
 *
 * 刻意做成**按需查询**而不是挂在 `DisplayCell` 上：Excel 的溢出边框只在选区
 * 落进数组里时才出现，所以每次选区移动查一次就够，可见窗口里每格多带两个字段
 * 是纯浪费。取舍见 `README.md`「为什么不走可见窗口投影」。
 */
export interface SpillRegionRequest extends SheetRef {
  kind: 'spill-region'
  row: number
  col: number
  requestId?: number
  revision?: number | string
}

/** 一个活动溢出区：锚点坐标 + 含锚点在内的外接矩形。 */
export interface SpillRegion {
  /** 数组公式真正所在的格子。矩形的左上角恒等于它。 */
  anchor: CellCoord
  /** 溢出区外接矩形，含锚点。 */
  range: CellRange
}

export interface SpillRegionResult extends SheetRef {
  kind: 'spill-region'
  /**
   * 查询坐标不落在任何**活动**溢出区里时为 `null`。碰撞态（`#SPILL!`）锚点也是
   * `null` —— 它一个格子都没装上，Excel 同样不给它画边框。
   */
  region: SpillRegion | null
  /**
   * 锚点那一格的公式原文（含前导 `=`）。**它是整个溢出区的属性**，不是查询坐标的 ——
   * 投影格没有自己的公式，Excel 在公式栏里给它们看的正是这一条。
   *
   * 与 `region` 同生共死：`region` 为 `null` 时无意义（碰撞态锚点的公式在它自己格子
   * 上，投影读得到，不用绕这一圈）。
   *
   * 缺席 = **后端答不出**（手写替身、早于这条字段的产物），不是「锚点没有公式」——
   * 锚点按定义一定有一条数组公式。缺席时公式栏退回原行为（显示投影值、可编辑），
   * 与 `blockedBy` 缺席时不说话是同一条降级纪律。
   */
  anchorFormula?: string
  /**
   * 查询坐标是碰撞态（`#SPILL!`）锚点、且后端说得出**要清哪一格**时，给出那一格的坐标。
   *
   * 不保证它落在锚点想要的矩形里：阻塞物若是别的数组的投影格，后端报的是**那个数组的
   * 锚点**（清投影格只会把那个数组也塌成 `#SPILL!`）。所以这条的语义是「清掉它，这个
   * `#SPILL!` 就没了」，不是「它压在矩形的哪一格上」。
   *
   * **缺席有两种原因，本层刻意不区分**：「这一格不是碰撞态锚点」与「后端答不出」
   * （TS 参考引擎没有溢出索引，见 `worker-protocol.ts` 的 `SpillRegionWire`）。
   * 理由是 UI 对两者的处理完全一样 —— 说不出就不说。要分辨得去看 wire 层。
   *
   * 与 `region` 互斥：装上了投影就不存在阻塞物。
   */
  blockedBy?: CellCoord
  /**
   * `blockedBy` 指的是一个**动态数组**（那一格是某个数组的锚点），不是用户自己打的值。
   *
   * 只影响措辞，不影响该不该说话：为真时宿主该说「被那儿的数组挡住」，否则用户对着一格
   * 看着空空如也的地址（数组的内容画在它的投影格上）会以为提示指错了。缺席 = 「不是
   * 数组」或「后端答不出」，两者退回同一句朴素说法。
   */
  blockedByArray?: boolean
  requestId?: number
  revision?: number | string
}

/** 当前高亮的溢出区 —— 比 `SpillRegion` 多一个「属于哪张表」与锚点的公式原文。 */
export interface ActiveSpillRegion extends SpillRegion, SheetRef {
  /** 见 `SpillRegionResult.anchorFormula`；后端答不出时缺席。 */
  anchorFormula?: string
}

/**
 * 「这一格的公式栏该显示哪条**别人的**公式」。
 *
 * 只对**投影格**成立：锚点自己是那条公式的主人，正常可编辑，不走这条路。
 *
 * 存在即意味着**不可编辑** —— 把这条公式提交进投影格会按 ADR 0006 的写入语义
 * 把整个数组塌成 `#SPILL!`，所以 Excel 把它做成灰色只读的。宿主拿到它就该关掉
 * 公式栏的输入，而不是显示完再指望用户不动手。
 */
export interface SpillProjectedFormula {
  /** 那条公式真正所在的格子。用来告诉用户「去哪儿改」。 */
  anchor: CellCoord
  /** 锚点的公式原文，含前导 `=`。 */
  formula: string
}

/**
 * 一个说得出理由的 `#SPILL!`：锚点在哪，要清哪一格。
 *
 * 只在**选中锚点本身**时存在 —— 与溢出边框同一条按需查询、同一格缓存。用户站在
 * 别处时引擎当然还知道，但没人问就不查。
 */
export interface ActiveSpillBlockage extends SheetRef {
  /** 读 `#SPILL!` 的那个数组公式格（= 查询坐标）。 */
  anchor: CellCoord
  /** 清掉这一格，数组就能溢出来。见 `SpillRegionResult.blockedBy`。 */
  blockedBy: CellCoord
  /** `blockedBy` 是不是一个数组的锚点；决定宿主说哪一句。见同名应答字段。 */
  blockedByArray?: boolean
}

/** 一格在溢出区里的身份：锚点，还是从锚点溢出来的投影格。 */
export type SpillCellRole = 'anchor' | 'projected'
