# custom-formulas — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/custom-formulas/（含 README.md，JS 侧 host API）；
> 引擎契约 excel/rust/excel-core/src/CUSTOM_FORMULAS.md（marshaling / 异步 `#BUSY!` 语义为准）；
> host 转发 excel/solid-excel/src-vnext/provider/SpreadsheetUiProvider.tsx +
> adapter/async-custom-pump.ts；demo 种子 src-vnext/demos/VNextWorkerDemo.tsx
> （MYTAX/GREET/CELSIUS/SUMSQ2 + 异步 SLOWTAX，注销仅在 demo 卸载时触发）。
> 存量 spec 行数超限登记：无（custom-formulas.spec.ts 219 行）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| CF-01 | banner 自述四个种子公式 | 打开 vNext Worker demo | banner 文本含 MYTAX/GREET/CELSIUS/SUMSQ2 | ✅ 存量 | custom-formulas #"registration banner" |
| CF-02 | 标量数字参数往返 | `=MYTAX(100)` | 显示 20 | ✅ 存量 | custom-formulas #"round-trip through the worker engine" |
| CF-03 | 单元格引用参数 | `=MYTAX(B4)`（B4=10） | 显示 2 | ✅ 存量 | custom-formulas #"round-trip through the worker engine" |
| CF-04 | 字符串参数与字符串返回 | `=GREET("World")` | `Hello, World` | ✅ 存量 | custom-formulas #"round-trip through the worker engine" |
| CF-05 | 数字返回精度 | `=CELSIUS(212)` | 100 | ✅ 存量 | custom-formulas #"round-trip through the worker engine" |
| CF-06 | Nx1 range 参数二维数组 marshal（MED #6 回归） | `=SUMSQ2(B2:B4)` | 14 | ✅ 存量 | custom-formulas #"round-trip through the worker engine" |
| CF-07 | 名称大小写不敏感（LOW #14 回归） | `=mytax(50)` | 10 | ✅ 存量 | custom-formulas #"engine lookup semantics" |
| CF-08 | 未注册名 → `#NAME?` | `=UNKNOWN_FN(5)` | `#NAME?` | ✅ 存量 | custom-formulas #"engine lookup semantics" |
| CF-09 | 内建 SUM 不被注册表遮蔽 | `=SUM(1,2,3)` | 6 | ✅ 存量 | custom-formulas #"engine lookup semantics" |
| CF-10 | 静态后端缺 port 时能力降级 | Wave5 键入 `=MYTAX(100)` | `#NAME?` 或 `#ERROR!` | ✅ 存量 | custom-formulas #"capability gating" |
| CF-11 | 再入守卫拒绝恶意 source（HIGH #1） | 需注册任意 source 的 host 钩子 | 注册被拒 | ⏳ P2 延后 | custom-formulas #"coverage notes"（test.fixme 挂起；无 UI 入口，单测已覆盖 rust/excel-core tests） |
| CF-12 | 异步公式 `#BUSY!` → 结果落定并传播到依赖格 | C6 `=B6*2`，B6 `=SLOWTAX(100)`（seed 800ms） | B6 过渡态 `#BUSY!`，落定 B6=20、C6=40 | 🆕 本轮 | async-custom-formulas.spec.ts |
| CF-13 | 同 (name, args) 落定后 memo 复用（无二次延迟） | B6 落定后 D6 再写 `=SLOWTAX(100)` | 700ms 内出 20（< 800ms 人为延迟即证明 memo 命中） | 🆕 本轮 | async-custom-formulas.spec.ts |
| CF-14 | `IFERROR` 吞掉 pending `#BUSY!` | C6 `=IFERROR(B6,"pending")`，B6 `=SLOWTAX(50)` | busy 窗口内 C6=pending，落定后 10 | 🆕 本轮 | async-custom-formulas.spec.ts |
| CF-15 | M×N（行×列均 >1）range 参数行主序 marshal | B2:C3 置 1/2/3/4，`=SUMSQ2(B2:C3)` | 30（1+4+9+16；存量 CF-06 只覆盖 Nx1） | 🆕 本轮 | custom-formulas-range-2d.spec.ts |
| CF-16 | range 内空单元格以 null 标量传入 | B2=3、B3 清空，`=SUMSQ2(B2:B3)` | 9（null→Number(null)=0） | 🆕 本轮 | custom-formulas-range-2d.spec.ts |
| CF-17 | 注销后单元格降级为 `#NAME?` | 需运行中触发 unregister 的入口 | 引用格重算为 `#NAME?` | ⏳ P2 延后 | — 无 UI 入口：demo 仅在卸载 onCleanup 注销（VNextWorkerDemo.tsx），格随 demo 一起消失，无法在可见网格上观察降级；需 host 提供运行中注销按钮/钩子 |
| CF-18 | 重注册同名替换 source 并清 memo | 需运行中重注册入口 | 旧结果失效、回调重执行 | ⏳ P2 延后 | — 无 UI 入口，理由同 CF-17；host registry 语义有单测（spreadsheet-ui-core test/custom-formulas.test.ts） |
| CF-19 | 异步回调 reject → `#VALUE!` | 需注册会 reject 的 async source | `#VALUE!` | ⏳ P2 延后 | — 无 UI 入口：种子 SLOWTAX 不会 reject，需要任意 source 注册钩子（同 CF-11） |
| CF-20 | 后端无异步 port 时注册被拒（ASYNC_CUSTOM_FORMULA_UNSUPPORTED） | 需缺 async port 的构建 | 显式拒绝而非静默注册 | ⏳ P2 延后 | — 无 UI 入口：两个 worker 运行时均带 async-custom-pump，e2e 面上不存在缺 port 宿主 |
