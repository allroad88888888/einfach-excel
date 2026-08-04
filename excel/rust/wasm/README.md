# einfach-wasm

`einfach-excel-core` 的 WASM 绑定。把 `Sheet` / `Workbook` 以 `WasmSheet` / `WasmWorkbook`
暴露给 JS。

由 `wasm-pack` 构建：默认 lite 产物落在 **`excel/solid-excel/wasm-pkg/`**，full
产物落在同目录的 `wasm-pkg-full/`（都不在本 crate 目录里 —— `wasm-pack` 的
`--out-dir` 相对 crate 目录解析，见根 `package.json` 的 `ensureWasm` 与 solid-excel 的
`build:wasm*` 那几条）。

这条链路是 `wasm-pack build` 之后接一步 `scripts/strip-wasm-names.mjs`，把 `name` custom
section（函数符号表，占产物 18–20%）剥掉 —— 本仓关了 wasm-opt（见 `Cargo.toml` 里
`wasm-opt = false` 的注释），而 wasm-opt 顺带做的正是这个剥离，所以要自己补上。
调 panic 栈需要可读符号名时用 `*:keep-names` 那条（只跑 `wasm-pack`，不剥）。

## 两份产物：lite 与 full

REGEX* 三个内建（`REGEXTEST` / `REGEXEXTRACT` / `REGEXREPLACE`）靠 `regex` crate，而
`regex` 连同它的传递依赖是**整个产物的三分之一**。所以按 `regex-formulas` feature 切成两份：

| | **lite** | **full** |
|---|---|---|
| 目录 | `excel/solid-excel/wasm-pkg/` | `excel/solid-excel/wasm-pkg-full/` |
| 构建 | `npm run build:wasm -w @einfach/solid-excel` | `npm run build:wasm:full -w @einfach/solid-excel` |
| cargo feature | 无（默认） | `--features regex-formulas` |
| REGEX* | 不存在，求值为 `#NAME?` | 可用 |

两份一起构建用 `npm run build:wasm:both -w @einfach/solid-excel`。

**lite 是默认**：`wasm-pack build` 不带参数出的就是它，`ensureWasm`、playwright 的
`webServer`、以及 vnext worker 的默认 factory 全都指向 `wasm-pkg/`。full 有一个现成的
worker 入口（`worker-runtime-full.ts`），但没有任何库内代码引用它 —— 见下面「怎么选 full」。

极性是刻意反的：`einfach-excel-core` 那侧 `regex-formulas` 在 `default` 里（Rust 消费者
不该因为新增 feature 就静默少掉内建），本 crate 这侧默认关（浏览器默认不该为没人用的
函数付三分之一体积）。

### 体积

剥完符号后实测（2026-08-03，`opt-level = "s"` + `lto`，未跑 wasm-opt）：

| 口径 | lite | full | 省下 |
|---|---:|---:|---:|
| raw | 1,672.0 KB | 2,588.5 KB | 916.4 KB（35.4%） |
| gzip -9 | 524.8 KB | 829.2 KB | 304.4 KB（36.7%） |
| `code` 段 | 1,538.2 KB | 2,059.7 KB | 521.5 KB（25.3%） |
| `data` 段 | 116.8 KB | 508.8 KB | 392.0 KB（77.0%） |

绝对值会随功能增长漂（上一次 2026-07 是 1,627.1 / 2,542.1 KB），**要看的是「省下」
那一列的稳定性** —— 它由 `regex` 依赖树的大小决定，不由本仓代码量决定。

`data` 段那 77% 是最干净的证据：`regex-syntax` 的 Unicode 属性表是纯静态数据，不受 LTO
把代码归到哪个 crate 的噪声影响。现场复算：

```bash
ls -l excel/solid-excel/wasm-pkg{,-full}/einfach_wasm_bg.wasm
gzip -9 -c excel/solid-excel/wasm-pkg/einfach_wasm_bg.wasm | wc -c
```

### 语义差异：两种构建只差"少三个函数"，不差别的

选构建时要知道的就一条：**lite 下 `=REGEXTEST(...)` 求值为 `#NAME?`，full 下能用。**
除此之外两种构建的行为完全一致 —— 特别是**同一份工作簿不会算出不同的值**。

这句话是被一条决策撑住的，不是自然成立的。求值优先级是「内建 → 定义名 LAMBDA →
宿主自定义公式 → `#NAME?`」（见 `eval.rs` 里 `eval_named_call` 的 **Precedence** 注释），
所以如果保留名清单 `is_builtin_function_name` 跟着 feature 门控走，就会出现：

- `define_name("REGEXTEST", "=LAMBDA(...)")` 两种构建都被接受，但 full 里内建赢、用户的
  LAMBDA 被**静默忽略**，lite 里内建不存在、LAMBDA 真的会跑；
- 宿主注册的同名 JS 自定义公式同理。

也就是同一份工作簿换个构建就算出别的数，而用户没有任何提示。

**保留名清单因此刻意不跟着门控**：REGEX* 三个名字在两种构建下都被保留，注册侧一律拒绝。
代价是 lite 用户不能用 JS 自定义公式 polyfill REGEX*（"想用就换 full"）。这是权衡后的
选择，见 `eval.rs::is_builtin_function_name` 里 REGEX* 那三行的注释。

门禁：`excel/rust/excel-core/tests/reserved_name_parity.rs` 断言「求值器分发的名字集合」与
「保留名清单」的差集恰好等于 `RESERVED_NAME_WHITELIST`，而那个白名单**现在是空的** ——
即"今天没有任何内建能被静默遮蔽"。曾经这里有 74 个漏网的名字（成因是生成器脚本路径算错、
从未真正跑过），现已全部补齐：500 = 500。

自定义公式的完整契约见
[`../excel-core/src/CUSTOM_FORMULAS.md`](../excel-core/src/CUSTOM_FORMULAS.md)。

### 另一条轴：TS 后端与 WASM 后端的 REGEX* 方言

上一节说的是 **lite ↔ full** 这条轴。还有一条正交的轴：worker 有两份运行时实现
（`worker-runtime.ts` 走 wasm，`worker-runtime-ts.ts` 走 `@einfach/excel-core-ts`），
而 REGEX* 在两边是**两套正则引擎**——Rust 的 `regex` crate 与 JS 的 `RegExp`。

Excel 的 REGEX* 三函数用 **PCRE2** 方言（微软 support 文档在三个函数页各写了一遍
“use the PCRE2 'flavor' of regex”）。以 PCRE2 为基准，两个引擎的位置是：

| | Excel（PCRE2） | WASM（`regex` crate） | TS（JS `RegExp`） |
|---|---|---|---|
| 反向引用 `(a)\1` | 支持 | **`#VALUE!`** | 支持 |
| lookahead / lookbehind | 支持 | **`#VALUE!`** | 支持 |
| `\d` `\w` `\b` | ASCII | ASCII（靠改写，见下） | ASCII |
| `\s` `\S` | ASCII | ASCII（靠改写） | ASCII（靠改写） |
| `(?P<n>)` | 支持 | 支持 | **`#VALUE!`** |
| 无匹配 | `#N/A` | `#N/A` | `#N/A` |

`\d` / `\w` / `\D` / `\W` / `\b` / `\B` 原本在 `regex` crate 下是 Unicode 感知的
（`\d` 认 `٥`、`\w` 认 `é`），于是 `=REGEXTEST("٥","\d")` 在两个后端**静默**算出
不同的布尔值。现在由 `excel/rust/excel-core/src/eval_regex_ascii.rs` 在编译前把模式
改写到 ASCII 口径，三方对齐。

`\s` / `\S` 是**两边都要改写**的一对：Rust 的 `\s` 走 Unicode `White_Space`，JS 的走
ECMAScript `WhiteSpace`+`LineTerminator`，两者**互不相等**（U+0085 只有 Rust 算空白，
U+FEFF 只有 JS 算空白），所以在这一点上两个后端本来就有分歧。TS 半边的改写在
`excel/excel-core-ts/src/eval/functions/regex-ascii.ts`。判定 Excel 走 ASCII 的依据是
`PCRE2_UCP` 的结构：它是**一个**开关，同时管 `\d`/`\s`/`\w`，而 10.43 起的
`PCRE2_EXTRA_ASCII_BS*` 只能在 UCP 开着时把个别转义**摁回** ASCII，不能反向给单个转义
加 Unicode。所以「`\d` ASCII + `\s` Unicode」这个组合在 PCRE2 里够不到 —— 既然 `\d`
按 ASCII 钉死，`\s` 只能同极性。完整三方实测表在
`excel/rust/excel-core/tests/regex_dialect_parity.rs` 的文件头。

**剩下的分歧不是疏漏，是引擎能力边界**：`regex` crate 是 RE2 血统，结构上就没有
反向引用与 lookaround。没有把 TS 侧也改成拒绝——那只会让两个后端一起偏离 Excel，
换来“错得一致”。

#### 评估过 `fancy-regex`，结论是不换

`fancy-regex` 能补上反向引用与 lookaround（实测三类构造全支持）。**体积那一关过了**：
`regex-formulas` 不在本 crate 的 `default` 里，`cargo tree --target wasm32-unknown-unknown`
证实 lite 的依赖图里一个正则引擎都没有，所以增量只落在 full ——
剥离后 2,648,449 → 2,833,466 字节（**+6.99%**），lite 零变化。

**卡住的是别的**：`fancy-regex` 拒绝 `(?-u:…)`（`Disabling Unicode not supported`），
而上面那套 ASCII 方言对齐正是靠它实现的。`\d` / `\w` 能改写成显式字符类，
**`\b` / `\B` 没有字符类等价物**，只能用 lookaround 拼出来 —— 而 lookaround 会让模式
离开 `regex` 的线性时间引擎、掉进回溯引擎。实测：原生 `\b` 走委派（线性），
lookaround 版 `\b` 触发回溯上限（单次 ~13ms）。

于是代价不是"只有写反向引用的用户承担"，而是**每一条含 `\b` 的模式都承担** ——
而 `\bword\b` 是表格正则里最常见的写法之一（13ms × 10 万行 ≈ 22 分钟）。
换来的能力只对主动写反向引用/lookaround 的用户有价值，这笔交易不划算，**故不换**。

回溯风险本身是有界的（`backtrack_limit` 默认 1_000_000，超限返 `Err` 而不是挂死；
不含 fancy 构造的模式仍被委派给 `regex`，经典的 `(a+)+$` 在 1001 字符输入上 209ns）。
真要重启这个决定，先解决 `\b` 的 ASCII/线性二选一。

换引擎也**换不掉**另外两条反向分歧（它们在 TS 侧）：`(?P<n>…)` 命名组 PCRE2 与 Rust
都支持、JS 抛异常；变长 lookbehind `(?<=a+)b` 只有 JS 支持，PCRE2 与 fancy-regex 都只
支持定长。

门禁是两份对称的钉子，**没有**走 `cross-engine-parity-*` 那张网——那张网的 WASM 侧
加载的正是 lite 产物，REGEX* 在那里求值成 `#NAME?`：

- `excel/rust/excel-core/tests/regex_dialect_parity.rs`
- `excel/excel-core-ts/test/regex-dialect.test.ts`

#### 「lite + TS 后端」不是一个格子

看起来还有一条产品分歧：**lite + TS 后端 REGEX* 可用，lite + WASM 后端 `#NAME?`**。
但把它读成矩阵是**错觉**：`lite` / `full` 是**这份 wasm 产物**的属性，TS 引擎根本不在
这条轴上 —— 不存在"lite 的 TS 版"。TS 后端就是另一个引擎，它有 REGEX*，和 Excel 一样。

**给 TS 侧也加门控？不加**，判据是体积对称性根本不成立：

| | 省下的体积 |
|---|---:|
| Rust 侧门控（现存） | **938,407 字节**（full 2,650,581 → lite 1,712,174，占 full 的 35.4%） |
| TS 侧若照做 | **5,173 字节源码**（146 行）；JS `RegExp` 本身在宿主引擎里，成本为 0 |

约 180 倍的不对称。门控存在的唯一理由是体积，而这个理由在 TS 侧不存在；再加上砍掉
TS 的 REGEX* 会让上面那两份对称钉子失去一侧，对拍能力直接没了。

**真正该盯的是另一件事**：两个后端可运行期互换（`worker-factory.ts` 导出两个 factory，
`excel-site` 的 `makeTsWorkerBackend` / `makeWasmWorkerBackend` 都是产品路径），所以
「只在一侧存在的函数名」是一整类风险，REGEX* 只是其中被文档化了的那一条。这条风险
现在由 `excel/solid-excel/test/engine-function-set-parity.test.ts` 钉住 —— 它断言两个
引擎的内建名集合**完全相等**，白名单是空的。立起它时抓到的第一条就是 `WRAPROWS` /
`WRAPCOLS`（TS 有、Rust 无，两份 wasm 都 `#NAME?`，且因为不在保留名清单里还会让宿主
的同名自定义公式在 TS 后端被静默遮蔽）。

### 怎么选 full

dispatcher 与"用哪份 wasm"已经解耦：worker 的消息循环住在
`excel/solid-excel/src-vnext/adapter/worker-runtime-core.ts`，导出
`installWorkerRuntime(wasm)`，`wasm` 是一份 `wasm-pack --target web` 产物的模块命名空间。
两个**薄入口**各自静态 import 一份产物再调它：

| 入口 | import | 包子路径 |
|---|---|---|
| `worker-runtime.ts` | `wasm-pkg/` | `@einfach/solid-excel/vnext-worker-runtime` |
| `worker-runtime-full.ts` | `wasm-pkg-full/` | `@einfach/solid-excel/vnext-worker-runtime-full` |

宿主侧三选一：

```ts
// 1) 默认 lite —— 什么都不用做，defaultVNextWorkbookWorkerFactory 就是它
import { defaultVNextWorkbookWorkerFactory } from '@einfach/solid-excel/vnext-worker-factory'

// 2) 换 full —— 先 `npm run build:wasm:full -w @einfach/solid-excel`，再自己 import 入口
import FullWorkbookWorker from '@einfach/solid-excel/vnext-worker-runtime-full?worker'
createWorkerWorkbookSpreadsheetBackend({ workerFactory: () => new FullWorkbookWorker() })

// 3) 自建产物 —— 写三行自己的 worker 入口
import * as wasm from './my-wasm-pkg/einfach_wasm.js'
import { installWorkerRuntime } from '@einfach/solid-excel/vnext-worker-runtime-core'
installWorkerRuntime(wasm)
```

**为什么是"宿主自己 import"而不是库里多一个 factory**：Vite 会静态分析
`new Worker(new URL('./x', import.meta.url))` 并在构建期解析 `x`。只要
`worker-factory.ts`（或任何 barrel / index）提到 full 入口，`wasm-pkg-full/` 就进了每个
消费者的构建图 —— 而它是 gitignore 且默认不构建的目录，于是 full 变成**构建期必需产物**，
每个只想要 lite 的人都得先花 2.5 MB 的构建。所以硬约束是：**库的 barrel / factory 不引用
任何一份 `wasm-pkg*`，两个薄入口都是叶子**。代价因此只落在真正选了 full 的宿主身上。

类型检查侧同理：`worker-runtime-full.ts` 会被本包的 `tsc` 编进程序，靠
`src-vnext/adapter/wasm-pkg-full-fallback.d.ts` 那条通配 `declare module` 兜底 —— 目录在场
时 TS 用 wasm-pack 生成的真 d.ts，缺席时才落到兜底，两种情况 `tsc --noEmit` 都通过。

`WasmWorkbook` 是现役接口，`WasmSheet` 是更早的单表接口。JS 侧的消费者是上面那两个薄入口
背后的 `worker-runtime-core.ts`，它把这些方法包装成 worker 协议（另一份实现
`worker-runtime-ts.ts` 用 `@einfach/excel-core-ts` 提供同一套协议）。

## 导出面

这里只列**能力域**，不列完整方法名 —— 方法在增，清单会腐坏。当前导出可以现场枚举：

```bash
grep -oE 'pub fn [a-z_0-9]+' excel/rust/wasm/src/lib.rs | sed 's/pub fn //' | sort -u
```

`WasmWorkbook` 覆盖的域：

| 域 | 说明 |
|---|---|
| 单元格读写 | 数字 / 文本 / 布尔 / 错误 / 公式；`try_*` 变体返回失败而非 panic |
| 多表 | 增删改名、移动、按 index 或 name 定位 |
| 结构操作 | 行列增删 |
| 命名区间 | `define_name` / `undefine_name` / `defined_names` |
| Excel Table | 建表改名删表、列改名、汇总行与汇总函数、快照与恢复 |
| 隐藏行 | `hide_rows` / `unhide_rows` / 快照恢复，以及**求值输入** `set_eval_hidden_rows` |
| 筛选 | `apply_filter` / `reapply_filter` / `clear_filter` / 快照恢复，及 `set_eval_filter_hidden_rows` |
| 排序 | `sort_range` |
| 格式 | 区间设格式、快照与恢复、行高列宽、viewport 尺寸快照 |
| 自定义公式 | 同步与异步注册、注销、异步请求 drain 与 resolve、计数与名单 |
| 批量导入 | `bulk_import_cells` / `bulk_install_workbook` / 带插桩的变体 |
| 稀疏快照 | `snapshot_sparse` / `snapshot_range_sparse` / `restore_sparse` / `read_sparse_range` |
| 持久化 | `snapshot_persistence_v1` / `restore_persistence_v1` |
| 自动填充 | `apply_auto_fill` |
| 订阅 | `subscribe_cell` / `unsubscribe_cell` |
| spill | `spill_anchor` / `spill_info`（JS 侧消费者：`worker-commands-spill.ts` 的 `spillRegion` 命令） |
| debug 探针 | `debug_*` 一族：求值次数、脏计数、活订阅数、依赖图统计、bulk import 分阶段耗时 |

隐藏行与筛选的**求值输入**（`set_eval_*`）与展示用的隐藏集是刻意分开的两组状态 ——
`SUBTOTAL` 的两档规则依赖这个区分，见
[ADR 0003](../../../docs/decisions/0003-engine-owns-filter-sort.md)。

自定义公式的引擎契约见 [`../excel-core/src/CUSTOM_FORMULAS.md`](../excel-core/src/CUSTOM_FORMULAS.md)。

## 测试

### 原生（不需要浏览器）

```bash
cargo test --manifest-path excel/rust/wasm/Cargo.toml
```

跑 `src/lib.rs` 里 `#[cfg(test)] mod tests` 的单测（host target），跳过 `tests/web.rs`
（它由 `target_arch = "wasm32"` 门控）。数量现场算：

```bash
grep -c '#\[test\]' excel/rust/wasm/src/lib.rs
```

### wasm32 —— 浏览器（验 microtask defer 的首选）

```bash
wasm-pack test --headless --chrome excel/rust/wasm
```

跑 `tests/web.rs` 里的 `#[wasm_bindgen_test]`。这是**唯一**能在真实浏览器语义下验证
`JsCallbackListener::on_change` 的 `queueMicrotask` defer 路径与 `__debugPanicNextCallback`
开关的方式（`console.error` 冒泡 + wasm 实例存活）。

如果 `wasm-pack test --headless --chrome` 把 `chromedriver` SIGKILL 了，通常是缓存的
chromedriver 与本机 Chrome 大版本不匹配。清掉 `~/Library/Caches/.wasm-pack/chromedriver-*`
重跑让 `wasm-pack` 重新下载匹配的驱动；或用 `CHROMEDRIVER=/path` 指向手装的那个。

### wasm32 —— Node（没有 chromedriver 时的退路）

```bash
wasm-pack test --node excel/rust/wasm
```

跑同一批测试。panic 注入那个（`wasm_sheet_panic_inject_surfaces_and_survives`）会在运行时
检测到 Node 并提前返回 —— Node 的 unhandled-microtask 行为会在「存活」那半被观察到之前
杀掉进程，所以该测试只在 `--chrome` 下完整执行。
