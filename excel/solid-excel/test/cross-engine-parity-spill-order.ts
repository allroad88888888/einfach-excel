/**
 * 第十类分歧：**区域物化的遍历顺序**。
 *
 * 单列一份文件而不是堆进 `cross-engine-parity-cases.ts`：那份已经贴着 300 行
 * 上限，与 `-general-text.ts` / `-criteria-*.ts` / `-overflow.ts` /
 * `-scientific.ts` / `-dynamic-array.ts` 同一个先例。
 *
 * # 这一类钉的是什么
 *
 * 一个区域实参展开成什么序列，是**几何事实**：行主序（先行后列）的坐标。
 * 但两个引擎内部都把「字面量格」和「公式格」分开存，Rust 侧的区域物化曾经
 * 「先发完整张字面量表、再发整张公式表」—— 两张表各自升序，拼起来却不是行
 * 主序。于是任何混了两类格子的区域，公式格一律被甩到序列最后：
 *
 * ```text
 * CC1 = =SEQUENCE(3)        锚点 CC1 是公式格，投影格 CC2/CC3 是字面量侧的派生 atom
 *   =MATCH(2,CC1:CC3,0)     TS 2      Rust 1
 *   =CONCAT(CC1:CC3)        TS "123"  Rust "231"
 *   =TEXTJOIN(",",1,CC1:CC3) TS "1,2,3" Rust "2,3,1"
 * ```
 *
 * TS 侧免疫是因为它按坐标嵌套循环回填矩形，顺序由几何决定而不是由存储决定。
 *
 * # 为什么必须跨引擎钉、而且要写闭式字面量
 *
 * 这一类的症状是「值全对、顺序全错」：`SUM` / `COUNT` / `AVERAGE` 这些顺序
 * 无关的聚合两侧永远相等，单看它们看不出任何问题（Rust 的 golden 回放语料
 * 正好只有这几个函数，所以整批 fixture 一格没动）。只有顺序敏感的消费者会
 * 暴露它，而「两侧相等」的断言在两边一起把锚点排到最后时同样为真 ——
 * 所以每条都写死期望的显示串。
 *
 * # 表的结构：三种铺法 + 两组反向控制
 *
 * 同一份 `1,2,3` 用三种存储分桶铺出来，答案必须逐条相同：
 *
 * - **CC 列** `=SEQUENCE(3)`：锚点是公式格，两格投影在字面量侧 —— 报的那三条。
 * - **CD 列** `CD1 = =1`、CD2/CD3 是字面量：**跟 spill 无关**的同根因形态。
 *   少了这一列，读的人会以为这是个 spill bug，下一次给 spill 打特例补丁。
 * - **CE 列** 公式在**中间**（CE2）：错序的方向是「公式沉底」而不是「首格
 *   置后」，`1,3,2` 与 `2,3,1` 是两种不同的错，同表才分得开。
 *
 * 两组反向控制：
 *
 * - `=INDEX(CC1:CC3,2,1)` 走的是**按坐标读**那条支路（`runtime_ref_to_grid`
 *   按 (row,col) 回填），错序时它一直是对的 —— 它红了说明改坏的是另一件事。
 * - `=TEXTJOIN(",",TRUE,CC2:CC3)` 只含投影格，不含锚点，错序时也一直是对的。
 * - `=SUM(CC1:CC3)` = 6 是夹具自检：它两侧永远相等，红了说明三列根本没铺成
 *   1,2,3，此时上面所有断言的红都不可信。
 *
 * 期望值来源：`=SEQUENCE(3)` 铺出 1,2,3（微软 support「SEQUENCE function」，
 * 缺省 start = 1、step = 1，单参数即单列）；`MATCH` 返回的是**在区域内的相对
 * 位置**（「MATCH function」: "the relative position of an item in an array"）；
 * `TEXTJOIN` / `CONCAT` 按区域的读取顺序拼接。
 *
 * 刻意**没进**这张表的两条（都不是顺序问题，进来只会把这一类的红变成噪音）：
 *
 * - `=CONCATENATE(CC1:CC3)`：TS 给 `"1"`（区域实参取首格），Rust 给 `"123"`。
 *   这是「CONCATENATE 收不收区域」的分歧，与遍历顺序无关，另案。
 * - `=NPV(0.1,CC1:CC3)`：顺序敏感（引擎侧已在
 *   `excel/rust/excel-core/tests/range_materialization_order.rs` 钉住），但
 *   结果是无限小数，两侧显示串的有效位数不同，钉在显示层只会测到格式化。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/** 列 CC —— `=SEQUENCE(3)` 的锚点（CC1）与两格投影（CC2/CC3）。 */
const SPILL_COL = 80
/** 列 CD —— 非 spill 混合区域：公式在**首格**。 */
const FORMULA_HEAD_COL = 81
/** 列 CE —— 非 spill 混合区域：公式在**中间**。 */
const FORMULA_MID_COL = 82
/** 列 CF —— 一行一条探针。 */
const PROBE_COL = 83

/** 一条探针：公式 + 它必须显示的串。 */
type OrderCase = readonly [formula: string, displayed: string]

export const SPILL_ORDER_CASES: readonly OrderCase[] = [
  // --- CC 列：spill 锚点在区域内，报的那三条 ---
  ['=MATCH(2,CC1:CC3,0)', '2'],
  ['=CONCAT(CC1:CC3)', '123'],
  ['=TEXTJOIN(",",TRUE,CC1:CC3)', '1,2,3'],
  // 升序近似匹配走的是另一段分支（不提前 return），同样按位置答。
  ['=MATCH(3,CC1:CC3,1)', '3'],
  ['=XMATCH(2,CC1:CC3)', '2'],
  // --- CC 列的窄化窗口：错序时这两条分别是 "1,2" 之外的 "2,1" 与 "2,3,1" ---
  // 锚点 + 一格投影：区域里只有两格，错序把锚点甩到后面就是 "2,1"。
  ['=TEXTJOIN(",",TRUE,CC1:CC2)', '1,2'],
  // 区域越过 spill 尾（CC4/CC5 是空格，TEXTJOIN 的 ignore_empty 吃掉它们）。
  ['=TEXTJOIN(",",TRUE,CC1:CC5)', '1,2,3'],
  // --- 反向控制：这两条在错序时也是对的，红了说明改坏的是别的东西 ---
  // 只含投影格，区域里没有公式格 —— 分桶拼接恰好等于行主序。
  ['=TEXTJOIN(",",TRUE,CC2:CC3)', '2,3'],
  // 按坐标读的支路，从来不看发射顺序。
  ['=INDEX(CC1:CC3,2,1)', '2'],
  // 夹具自检：顺序无关，两侧永远相等；红了说明 CC 列压根没铺成 1,2,3。
  ['=SUM(CC1:CC3)', '6'],
  // --- CD 列：同根因的非 spill 形态，公式在首格 ---
  ['=TEXTJOIN(",",TRUE,CD1:CD3)', '1,2,3'],
  ['=CONCAT(CD1:CD3)', '123'],
  ['=MATCH(2,CD1:CD3,0)', '2'],
  // --- CE 列：公式在中间，错序是 "1,3,2" 而不是 "2,3,1" ---
  ['=TEXTJOIN(",",TRUE,CE1:CE3)', '1,2,3'],
  ['=MATCH(3,CE1:CE3,0)', '3'],
  // 系数按位置配幂次：1*2^0 + 2*2^1 + 3*2^2 = 17；错序（2,3,1）是 2+6+4 = 12。
  ['=SERIESSUM(2,0,1,CC1:CC3)', '17'],
]

/**
 * 采样地址。先三列夹具本身（外加 CC4 —— spill 尾后的幽灵格，必须是空的，
 * 否则「1,2,3」可能是把 4 格挤成 3 格挤出来的），再逐条探针。
 */
export const SPILL_ORDER_ADDRS: string[] = [
  ...[0, 1, 2].map((row) => a1(row, SPILL_COL)),
  a1(3, SPILL_COL),
  ...[0, 1, 2].map((row) => a1(row, FORMULA_HEAD_COL)),
  ...[0, 1, 2].map((row) => a1(row, FORMULA_MID_COL)),
  ...SPILL_ORDER_CASES.map((_, row) => a1(row, PROBE_COL)),
]

export const EXPECTED_SPILL_ORDER_DISPLAYS: string[] = [
  // CC1:CC3 = SEQUENCE(3)，CC4 是 spill 尾后的空格。
  '1',
  '2',
  '3',
  '',
  // CD 列与 CE 列铺的是同样的 1,2,3，只是公式格换了位置。
  '1',
  '2',
  '3',
  '1',
  '2',
  '3',
  ...SPILL_ORDER_CASES.map(([, displayed]) => displayed),
]

export const SPILL_ORDER_WORKLOAD: WorkloadCell[] = [
  { row: 0, col: SPILL_COL, kind: 'formula', value: '=SEQUENCE(3)' },
  { row: 0, col: FORMULA_HEAD_COL, kind: 'formula', value: '=1' },
  { row: 1, col: FORMULA_HEAD_COL, kind: 'number', value: 2 },
  { row: 2, col: FORMULA_HEAD_COL, kind: 'number', value: 3 },
  { row: 0, col: FORMULA_MID_COL, kind: 'number', value: 1 },
  { row: 1, col: FORMULA_MID_COL, kind: 'formula', value: '=2' },
  { row: 2, col: FORMULA_MID_COL, kind: 'number', value: 3 },
  ...SPILL_ORDER_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: PROBE_COL, kind: 'formula', value: formula }),
  ),
]
