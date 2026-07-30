# einfach-wasm

`einfach-excel-core` 的 WASM 绑定。把 `Sheet` / `Workbook` 以 `WasmSheet` / `WasmWorkbook`
暴露给 JS。

由 `wasm-pack` 构建，产物落在 **`excel/solid-excel/wasm-pkg/`**（不在本 crate 目录下 ——
`wasm-pack` 的 `--out-dir` 相对 crate 目录解析，见根 `package.json` 的 `ensureWasm`
与 solid-excel 的 `build:wasm`）：

```bash
npm run build:wasm -w @einfach/solid-excel
```

`WasmWorkbook` 是现役接口，`WasmSheet` 是更早的单表接口。JS 侧的消费者是
`excel/solid-excel/src-vnext/adapter/worker-runtime.ts`，它把这些方法包装成 worker 协议
（另一份实现 `worker-runtime-ts.ts` 用 `@einfach/excel-core-ts` 提供同一套协议）。

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
