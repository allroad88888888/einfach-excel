# einfach-wasm

`einfach-excel-core` 的 WASM 绑定。把 `Sheet` / `Workbook` 以 `WasmSheet` / `WasmWorkbook`
暴露给 JS。

由 `wasm-pack` 构建，产物落在 **`excel/solid-excel/`** 下（不在本 crate 目录里 ——
`wasm-pack` 的 `--out-dir` 相对 crate 目录解析，见根 `package.json` 的 `ensureWasm`
与 solid-excel 的 `build:wasm*` 那几条）。

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

剥完符号后实测（2026-07，`opt-level = "s"` + `lto`，未跑 wasm-opt）：

| 口径 | lite | full | 省下 |
|---|---:|---:|---:|
| raw | 1,627.1 KB | 2,542.1 KB | 915.0 KB（36.0%） |
| gzip -9 | 510.1 KB | 813.9 KB | 303.8 KB（37.3%） |
| `code` 段 | 1,496.1 KB | 2,016.4 KB | 520.3 KB（25.8%） |
| `data` 段 | 114.1 KB | 505.9 KB | 391.7 KB（77.4%） |

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
| spill | `spill_anchor` / `spill_info` |
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
