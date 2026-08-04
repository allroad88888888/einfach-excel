# 双引擎分歧与超限拆分 —— 交接与任务分解（2026-08-04）

> 提案/交接（文件名带日期）。任务全部落地后按 [CONTRIBUTING §文档规则](../CONTRIBUTING.md)
> 归档：结论上移进对应 README / ADR，本体 `git mv` 进 `archive/`。

这份文档给**接手的 agent** 用。每张任务卡自带足够上下文，不需要读上游会话。
调度约束只有一条：**`excel/rust/excel-core/src/eval.rs` 同一时刻只能有一个写者**。

---

## 当前路线：界面稳定性优先（2026-08-04 追加）

本轮公式兼容性工作在已验证的修复处停止。#111、#115、#116 均只保留本文档的结论与回归样例，
**不阻塞界面回归主线**；后续按业务优先级慢慢补，不得借“顺手对齐公式”扩大 evaluator 或数组
物化的改动范围。

当前优先级：

1. **P0：界面稳定性。** 以 `solid-excel`、`spreadsheet-ui-core` 的交互、渲染、路由、状态与
   控制台回归为准；该类问题可以立即进入主线修复。
2. **P2：公式兼容性尾项。** #111/#115/#116 只在具备独立的 Excel 取证、两端实现方案和不会干扰
   UI 稳定性的验证范围时重新开启。
3. 公式兼容性差异不得作为 UI 验收、构建、类型检查或界面发布的阻塞条件；但现有回归用例必须
   保留，防止已经核销的行为倒退。

重新开启前的最低条件：指定一个具体公式簇、给出 Excel 实测基线、界定 TS/Rust 写集，并附上
对应的跨引擎测试；不能以“批量清理可选参数”或“统一大数组语义”为名启动无边界重构。

---

## 0. 公共约定（每个 agent 都必须遵守，不重复写进各卡）

**硬规则**

1. **绝对不要 `git commit` / `push` / `stash` / `checkout` / `restore` / `rebase`**。由调度方统一提交。
2. 文件行数：普通 ≤300 行，强内聚的单一算法/状态机 ≤500 行（`wc -l` 口径）。
   本次改动顶破上限 → 拆分是本次改动的一部分。**路过存量超限文件做小改** → 在报告里指出超限
   并给拆分建议，**不擅自大重构**。
3. 不许为了变绿重新生成 golden fixture（见 `excel/rust/excel-core/tests/golden_replay.rs` 头注释）。
4. 后台/非交互 shell 跑可能读 stdin 的 CLI 必须加 `< /dev/null`。
5. **不要 `pkill` / `pgrep` 匹配 `"cargo"`**：`pgrep -f` 会匹配到自己的 shell 包装，`pkill` 会连带
   杀掉同管道的下游进程，实测让 cargo 永久挂起。要等后台任务就轮询哨兵文件。
6. 长任务用 `nohup ... & disown` **脱离**当前 shell 再跑，配哨兵文件轮询。被跟踪的子进程会随
   任务中止一起死，实测两次丢掉整轮 cargo 进度。
7. 长链按**可独立复用的边界**切开跑，别把「重建 wasm + 三套 cargo」串成一个任务 —— 一次中断
   整块作废。

**写集纪律**

每张卡都给了「独占写集」与「禁写」。需要改禁写文件才能完成 → **停下来把需求写清楚交回调度方**，
不要绕路自己实现一份平行逻辑。若那个文件当时**没有别的 agent 在写**，就地改并在报告里明确报备。

**验证纪律**

只跑受影响的套件，全量由调度方在收口时跑唯一一次。三套 cargo：

```sh
cd excel/rust/excel-core && cargo test                        # 默认 features
cd excel/rust/excel-core && cargo test --no-default-features  # lite
cd excel/rust/wasm       && cargo test
```

JS：`npx jest <路径> --no-coverage`。跨引擎新用例**新建自己的文件**，不要改已有的
`excel/solid-excel/test/cross-engine-parity-*.test.ts`。

**交付格式**

根因（不是症状）、改了哪些文件各多少行、跑过的命令与结果、**以及卡片里哪些前提是错的**——
错了就直说并给反证。卡片里标「待证伪的猜测」的部分本来就可能是错的。

---

## 1. 三条反复踩中的坑（这一程实测，不是经验之谈）

**坑一：绿不等于跑到了。** 一道门禁读绿，可能是它根本没在目标上执行。本程实测四例：

| 判据 | 假象 | 真相 |
|---|---|---|
| `grep -c CIRCULAR_DEPENDENCY` | 0 环 | rollup 输出的词形是 `Circular dependencies`，从没匹配过 |
| `npm run build` 的环检查 | 0 环 | [rollup.config.mjs](../rollup.config.mjs) 用 `src/index.ts` 筛包，而 `excel/solid-excel` 入口是 `src/index.tsx` —— 整个包没被扫过 |
| `import/no-cycle` | 0 环 | 仓里没装 `eslint-import-resolver-*`，插件解析不了 TS 路径，导入图是空的 |
| 架构门禁 10 项全绿 | 覆盖完整 | 它按文本扫 `src/sheet.rs`，而拆分刚把 7880 行搬了出去 |

**做法：改判据前先在已知阳性上证明它会响。** 例：往一个应被覆盖的文件注入一条被禁形状，
确认门禁抓红并点名，再还原。绿才有意义。

**坑二：自检要走真实代码路径。** 我写的环检测器自检通过、真实代码上漏报 —— 因为自检传的是
绝对路径，而真实调用传相对路径，图的键与边不同类。**自检的输入形态必须和真实调用一致。**

**坑三：搬家即脱离门禁。** 任何按**文件名文本扫描**的门禁，在拆分后都会静默缩小覆盖面。
`excel/rust/excel-core/tests/architecture_invariants.rs` 现在用 `read_dir` 通配 `sheet_*.rs`
家族（不写死清单，将来新拆的文件自动进网），并**逐文件先截 `#[cfg(test)]` 尾巴再拼**——
先拼后截会从第一个带测试的文件处整体截断。**拆 `eval.rs` 时必须同样处理，见 #104d。**

---

## 2. 调度：谁能同时跑

```
可立刻并行（互不相干）：#107  #108  #109  #112  #113  #114
                        ↓
串行独占 eval.rs：#104a → #104b → #104c → #104d
                        ↓
拆完后可并行：#95  #99  #101  #88  #110
公式尾项（文档暂存，不阻塞 UI 主线）：#111  #115  #116
```

---

## 3. 任务卡

### 现在就能并行的六张

---

#### #113 🔴 循环依赖门禁的两个盲区

**规模**：小。**独占写集**：`rollup.config.mjs`、`rules/.eslintrc`、`package.json`。

**已实测**：
- 盲区一：`rollup.config.mjs` 用 `fs.existsSync(`${p}/src/index.ts`)` 筛包，`excel/solid-excel`
  入口是 `src/index.tsx`，整个包（含 `src-vnext` 290 个文件）从未被扫过。注释写的意图只是
  「跳过走 vite 的 demo 应用」。
- 盲区二：`rules/.eslintrc` 里 `"import/no-cycle": 0`（规则配好了但关着），且 `settings` 无
  `import/resolver`、仓里没装 `eslint-import-resolver-*`。**把 0 改成 2 也照样零输出** ——
  已实测：对一个确实有环的目录报 0。
- 同配置的 `import/no-extraneous-dependencies` **没有**跟着失效，实测触发 305 次（它比对裸模块名
  与 package.json，不需要路径解析）。

**必须知道的口径**：只数**运行时**边（`import type` 编译期擦除，不构成初始化顺序上的环）。
按此口径 `excel/excel-core-ts/src` 的环恰好是 `eval/evaluate.ts` + 6 个 `eval/sparse-*.ts` 共
7 个文件，与 `rollup.config.mjs` 的 `INTENTIONAL_CYCLE` 白名单**完全吻合**；若把 `import type`
也数进去会膨胀成 78 个文件的假环。

**要求**：修好后必须用**已知阳性**证明它会响（那 7 个文件的环），并给 `evaluate ↔ sparse` 开
override 而不是关掉整条规则。不要把 `excel/solid-excel` 塞进 rollup 的构建产物列表 —— 那个包走
vite，会改变发布物。

---

#### #114 🔴 TS 侧空占位实参三处算错（Rust 与 Excel 一致）

**规模**：小。**独占写集**：`excel/excel-core-ts/src/eval/functions/`（math/stats 相关）、
`excel/excel-core-ts/src/eval/`。**禁写**：所有 Rust 文件。

**已实测**：`AVERAGE(1,,3)` TS 1.333 / Rust 2；`PRODUCT(2,,3)` TS 0 / Rust 6；
`MIN(1,,5)` TS 0 / Rust 1。Excel 与 Rust 一致，**这次是 TS 错**。

**根因（已证实）**：TS 按**值**判定空占位（`value.kind === 'blank'`），于是空占位变成参与计算的 0。
正确判据是**句法**的 —— Rust 侧用 `Expr::Omitted`。

**必读反证**：Rust 第一版也照抄了按值判定，被 `golden_replay` seed 11 line 853 抓出：
`=SEQUENCE(3,1,F11)`（**全文无 `,,`**）从 0/1/2 变成 1/2/3 —— 空**单元格引用**是有值的实参、
只是强转成 0。TS 侧同一个陷阱一定还在，改之前先找出 TS 的等价回归面。

---

#### #112 拆 `evaluate.ts`(1720) 与 `functions/lookup.ts`(1196)

**规模**：中。**独占写集**：这两个文件 + 新建文件。**禁写**：`eval/sparse-*.ts`、`eval/criteria-*.ts`。

**已给的职责缝**：把吃 LAMBDA 的高阶数组函数（`MAP` / `REDUCE` / `SCAN` / `BYROW` / `BYCOL` /
`MAKEARRAY` / `FILTER` / `TOCOL` 及其三个 sparse 分支，约 380 行）切成 `eval/higher-order.ts` ——
真职责边界（「吃 LAMBDA 的数组函数」vs「表达式求值器」），import 形状与 `sparse-*.ts` 同类，
可直接进 `INTENTIONAL_CYCLE` 现有那条正则。

⚠️ 拆文件最容易造环，而**现在那道门禁看不见这个包**（#113）。自己按「只数运行时边」的口径查。

---

#### #108 拆 `excel-core-ts` 函数表

**规模**：中。**独占写集**：`excel/excel-core-ts/src/eval/functions/stats.ts`(3236)、
`financial.ts`(2576)、`math.ts`(1738)、`engineering.ts`(1461) + 新建文件。

**参照物**：`functions/text.ts` 3302 行在 commit `c000dab` 拆成 `functions/text/` 25 个文件
（最大 251）。先读那个 commit。

**已给的第一刀**：`stats.ts` 里的 criteria 语法层（`parseCriterion` / `matchesCriterion` /
`wildcardMatch` / `scalarEquals` / `makeCriterionMatcher` / `averageTierNumber`，约 250 行）
抽成 `eval/criteria-grammar.ts` —— 它已经是三个 `sparse-*.ts` 的共同上游，抽出不新增环。

⚠️ **稀疏孪生**：`eval/evaluate.ts` 会把约 17 个函数名截流进 `eval/sparse-*.ts`，被截流的名字
其 `FUNCTIONS.X` **在真实公式路径上不跑**。纯搬运不受影响，但别顺手"修"任何东西。

---

#### #107 拆 `wasm/src/lib.rs`(7438) 与 `workbook.rs`(5648)

**规模**：大。**独占写集**：`excel/rust/wasm/src/`、`excel/rust/excel-core/src/workbook.rs` + 新建。
**禁写**：`eval.rs`、`sheet*.rs`。

**参照物**：`sheet.rs` 10561→2685 的两刀（测试下沉 `src/sheet_tests/` + 生产代码按职责拆 32 个
`sheet_*.rs`），见 commit `4f7bd06`。

⚠️ `excel/rust/excel-core/tests/architecture_invariants.rs` 里有 `wasm_public_api_signatures_unchanged`
与 `wasm_snapshot_generate` 两条按文本扫 `../wasm/src/lib.rs` 的断言。**拆分会让它们缩小覆盖面**
（坑三），必须同批把读取口改成通配家族，并用注入法证明它仍会响。

**判据**：拆前拆后测试数字必须完全一致；数字变了就是搬丢了东西。建议同时做完整测试名集合的差集。

---

#### #109 拆 UI 层超限文件

**规模**：大。**独占写集**：`excel/solid-excel/src-vnext/grid/SpreadsheetGrid.tsx`(4115) 与
`excel/spreadsheet-ui-core/src/` 下 6 个超限 `index.ts`（filter-sort 2996 / find-replace 2123 /
text-to-columns 1853 / remove-duplicates 1813 / conditional-formatting 1676 / sheet-tabs 1528）。

**约束**：`excel/spreadsheet-ui-core` **不得** import Solid / React / DOM / worker / WASM。
每个 feature 的 `README.md` 里 atom 分类（source / derived / command）必须跟着更新。
参照 commit `d79f8e9` 的两层缝做法（端口分组 vs「拥有哪一类事实」）。

---

### 独占 eval.rs 的一串（必须串行）

`excel/rust/excel-core/src/eval.rs` 现在 22425 行：`eval_func` 一个 `match` 占
**3012→9710 共 6698 行 / 501 个臂**，其余是上游基础设施与下游实现函数。

**INV-6**（见 [ATOM_DELEGATION_REWRITE_PLAN.md](../excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md) §2
及「INV-6 管什么、不管什么」）：判定线是——改的是这些文件**「怎么伸手去够引擎机制」**，还是
**「函数体内部算什么」**。纯搬运与函数体内的 Excel 语义修复不需要豁免；引入 address→formula
索引/缓存/捷径需要豁免。

---

#### #104a 切 `eval_func` 的 501 个臂

**规模**：大。**独占写集**：`eval.rs` + 新建 `eval_fn_*.rs`。

按函数族切成约 12 个文件（lookup / text / math / stats / financial / date / logical / info /
db / dynamic-array / ref / engineering），`eval.rs` 只留分派。**纯搬运，零语义改动。**

保持 `crate::eval::X` 的外部路径不变 —— 参照 `formula.rs` 在 commit `0ed53f1` 拆成 15 个文件时
用模块根 `pub(crate) use` 重导出的做法。

⚠️ `excel/rust/excel-core/tests/reserved_name_parity.rs` 依赖 `eval_source_scan` 按区间扫
`eval.rs` 里 `is_builtin_function_name` 的 `matches!(…)` 与 `eval_func` 的 `match name { … }`
（当前 502 = 502，白名单为空）。**拆分会打断这个扫描**，必须同批修好它的读取口。

---

#### #104b 让实现函数跟着族走

**规模**：中。9710 行以后的实现/辅助函数（`rank_eq` / `percentile_impl` / `correl_impl` /
财务与日期助手等）搬进 #104a 建好的族文件。

---

#### #104c 切公共基础设施

**规模**：中。3012 行之前的部分：`coerce_*` / `broadcast_*` / `runtime_ref_*` / `stream_range` /
`collect_criteria_pairs` / `for_each_*` / `DatabaseRange` 等，按职责切成 `eval_core_*.rs`。

⚠️ 这些是 `eval_criteria_family.rs` / `eval_criteria_blank.rs` / `eval_wrap.rs` / `eval_regex*.rs`
的共同上游，改签名会波及它们。

---

#### #104d 门禁跟着 eval 家族搬家

**规模**：小，但**不做就等于前三步把一大片代码搬出了门禁**（坑三）。

照 `architecture_invariants.rs` 现有的 `sheet_family_sources()` 做法，给 eval 家族做同样的
`read_dir` 通配 + 逐文件截测试尾 + 逐文件归因。**必须用注入法证明它在新覆盖的文件上会响。**

---

### 拆完 eval.rs 之后可并行的一组

---

#### #95 🔴 Rust 的 `VLOOKUP` / `HLOOKUP` / `XLOOKUP` 吃整轴仍 `#VALUE!`

TS 侧已修好（commit `a827bac` + `192b65e`），这是**新分歧**。
已复核：`XLOOKUP(3,F:F,G:G)` 在**不含任何 `,,`** 时同样失败，所以与空占位无关，是独立缺陷。
参照同族已修好的 `SUMIF` 区域实参 funnel（commit `876a739`）。

---

#### #110 ✅ 已核销：Rust 的 `SUMPRODUCT` 整轴实参按坐标对齐

**已实测**（12 万行表）：`SUMPRODUCT(F:F,G:G)` TS 1360 / Rust 1360 / Excel 1360；
根因是多实参按位置对齐，而不是稀疏遍历。现已按稀疏坐标对齐，静默的 `0` 已消除。
另 `SUMPRODUCT(A:XFD)` TS `#NUM!` / Rust 264 / Excel 264；TS 数组物化上限的取舍归入 #111，
不作为本卡或 UI 主线的阻塞项。
已在 `excel/solid-excel/test/cross-engine-parity-large-range.test.ts` 里按引擎分别钉死。

---

#### #99 条件聚合家族对不存在的表静默答 0，而 `SUM` 答 `#REF!`

**根因（已证实）**：`eval.rs` 的 `resolve_range_arg` 返回 `Option`，把「表不存在（`#REF!`）」与
「没有形状」压成同一个 `None`。改 `Option` → 携带原因的类型会波及全部调用方，属于本卡的一部分。
两侧都要看：TS 侧行为需实测后对齐，**一个 agent 同时持两侧**。

---

#### #101 `INDIRECT("'My Sheet'!A1")` 在 Rust 上 `#REF!`

`eval.rs` 的 `parse_indirect_ref` / `parse_indirect_body` 是**另一条独立的解析路径**，
没跟着 commit `3743343`（带引号表名）一起修。TS 侧给值。

---

#### #88 `ADDRESS` / `CELL("address")` 仍自己拼 `$`

commit `2318a2c` 统一了 `[$]列[$]行` 的写出逻辑，但 `eval.rs` 里这两处仍是独立实现。
收敛到共享 writer **需要开 INV-6 豁免**（写清理由，照 EX-6.1 / EX-6.2 的格式）。

---

#### #116 🟡 文档暂存：空占位实参的剩余分歧簇

已按 Excel 16.111.2 实测修正并写入两端与跨引擎回归：

- `INDEX(F1:G5,2,)` 的空 `column_num` 按 0 返回并溢出整行 `{2,20}`；Rust 将
  `INDEX` 加入数组候选闸门，避免只显示锚点格。
- `WEEKDAY(45000,)` 是 `#NUM!`，不是此前误记的 Excel `2`；尾随空槽在这里
  数值化为 0，落入非法 `return_type` 值域。
- `SUMPRODUCT(F1:F5,)` 是 `#VALUE!`；1×1 空值与 5×1 区域形状不相同，不能广播。

`SORTBY(array,by_array,)` 的 [`sort_order1` 是可选参数，省略时默认升序](https://support.microsoft.com/en-us/office/sortby-function-cd2d7a62-1b93-435c-b561-d6a35134f28f)。Rust 以
`Expr::Omitted` 识别尾随空槽并采用该默认值；TS 的 `FunctionImpl` 仅收到求值后的
`BLANK`，无法区分尾逗号与空单元格引用，当前仍报 `#VALUE!`。这是一条已声明的
跨引擎差异；要消除它需要把实参的语法存在性传进 TS 函数分派层，不能以“blank 即省略”
的值判定替代。

⚠️ 本卡仅收敛了已验证的代表簇，并不把约 460 个带可选参数的 `match` 臂误称为已审计完毕；
其余函数仍需按“语法省略 / 空值 / 默认值 / 值域与形状”逐类取证。

**状态**：剩余 `SORTBY` 分歧及未审计的可选参数函数簇降为 P2；保留上述测试和结论，当前不改
TS 分派接口、不做批量兼容性重构，也不阻塞 UI 稳定性回归。

---

### 需要先拍板 / 需两侧同批

---

#### #111 🟡 文档暂存：区域物化上限的跨引擎取舍

TS 侧现在的闸门是 `ARRAY_CELL_CAP`（1,048,576），不变式是**「一个矩形物化得动，当且仅当它作为
数组结果落得了地」**（见 `excel/excel-core-ts/src/eval/range-gate.ts`）。
Rust 侧没有等价的数组落地闸门，而聚合可按稀疏坐标完成；`SUMPRODUCT(A:XFD)` 已返回 Excel 的
264。TS 是否应放宽 `ARRAY_CELL_CAP`、Rust 是否应在其它物化路径设限、以及两侧口径是否一致，
均是后续产品/性能取舍。

**状态**：降为 P2 决策卡。保留现有跨引擎用例，当前不改上限、不扩展区域物化，也不作为 UI
回归或发布阻塞条件。恢复时必须带明确的内存预算、Excel 取证及独立性能测试。

---

#### #115 ✅ 文档核销：`LAMBDA` 的 `[y]` 不是字面语法

此卡前提不成立。方括号是文档中对语法项的标记，不是公式里的参数声明；微软的
[`ISOMITTED` 示例](https://support.microsoft.com/en-us/excel/isomitted-function) 正是
`LAMBDA(x,y,...)(1,)`，其中未加方括号的 `y` 以尾随逗号省略。两侧现有行为都把
少传形参标记为 omitted 并由 `ISOMITTED` 识别，符合该基线。字面 `[y]` 在 Rust
会进入结构化引用解析，不能把它新增为 Excel 扩展；本卡不改源码。

**状态**：结论已固定，仅保留文档和既有回归；不进入 UI 主线，也无需额外公式改动。

---

## 4. 结项判据

调度方收口时在**同一棵树**上跑一次，缺一不可：

```sh
cd excel/solid-excel && npm run build:wasm:both     # Rust 变了就必须重建
cd excel/rust/excel-core && cargo test               # 基线 116 target / 2554
cd excel/rust/excel-core && cargo test --no-default-features   # 基线 116 / 2514
cd excel/rust/wasm && cargo test                     # 基线 5 / 71
npx jest --no-coverage                               # 基线 242 套件 / 5795
npm run check:docs && npm run lint:check && npm run typecheck:apps && npm run build
```

外加：golden fixture 零改动；`src-vnext` 零环（**用自己验证过会响的判据**，不能只看
`npm run build`，理由见 #113）。

pre-commit 钩子跑 `check:docs` / `lint:check` / `typecheck:apps` / `build` / `npm test`，
测的是**工作树**而非各次提交的暂存内容 —— 分多次提交时它会重复跑同一棵树。
