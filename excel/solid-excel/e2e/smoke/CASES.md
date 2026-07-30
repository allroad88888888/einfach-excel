# 冒烟 + 回归钉子（smoke）— e2e cases

> 功能源码：src/App.tsx（demo 壳 + tab 导航）、src/Table.tsx + src/sheet-store.ts（legacy 表格）、
> src-vnext/demos/（vNext demo 装配）、src-vnext/provider/SpreadsheetUiProvider.tsx
> 存量 spec 行数超限登记：vnext-smoke.spec.ts 396 行、vnext-real-backend-smoke.spec.ts 339 行、
> regression.spec.ts 308 行（均为历史文件，>300 普通上限、<500，只登记不拆）

## 存量场景映射

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| SM-01 | Blank 编辑提交 + 公式求值 + 依赖传播 | 双击输入→Enter；`=A1+1`；改 A1 | 显示值、下游重算 | ✅ 存量 | smoke #"cell edit + commit…" #"formula commit…" #"dependency propagation…" |
| SM-02 | undo / redo 快捷键（Blank） | 提交后 Ctrl+Z / Ctrl+Shift+Z | 显示值回退/重放 | ✅ 存量 | smoke #"Ctrl/Cmd+Z undoes…" #"…redoes after undo" |
| SM-03 | FormulaBar 显示公式源 | 选中公式格 | bar 值 `=A1+1`、addr | ✅ 存量 | smoke #"FormulaBar shows formula source…" |
| SM-04 | 键盘导航 Arrow / Tab / Shift+Tab | 逐键移动 | `.cell-selected` 迁移 | ✅ 存量 | smoke #"keyboard navigation moves selection…" |
| SM-05 | 默认启动直达 Wave 5 | `goto /` | wave5 tab active + grid 可见 | ✅ 存量 | vnext-smoke #"app boots directly into the Wave 5 demo…" |
| SM-06 | vNext 可见窗口渲染 + rich cell 投影 | 开 vNext demo | 窗口内 cell 数、J20 不存在、rich 属性 | ✅ 存量 | vnext-smoke #"renders only the visible window" #"renders projected rich cells…" |
| SM-07 | vNext 选择 / 填充柄 / 双击编辑 / 公式栏 | 逐交互 | active class、提交值 | ✅ 存量 | vnext-smoke #"click selection…" #"fill handle…" #"double-click edit…" #"formula bar edits…" |
| SM-08 | vNext sheet tab 生命周期 + 拖拽排序 + Ctrl 翻页 | 增删改名、拖拽、Ctrl+PgUp/Dn | tab 列表与元数据 | ✅ 存量 | vnext-smoke #"sheet tabs keep active…" #"sheet tab add rename and delete…" #"sheet tab drag reorder…" #"ctrl page keys…" |
| SM-09 | vNext 数据感知导航 | Ctrl+Arrow、Alt+Page | 落点地址 | ✅ 存量 | vnext-smoke #"data-aware ctrl arrow…" #"alt page keys…" |
| SM-10 | vNext 工具栏 / 右键菜单 / 行列命令 / resize | 逐命令 | 投影变化、尺寸元数据 | ✅ 存量 | vnext-smoke #"toolbar and context menu…" #"range context menu clear…" #"row and column context menu…" #"row and column resize…" |
| SM-11 | vNext 复制粘贴 + 超大范围 TSV 导出 | 右键 copy/paste；超窗口选区复制 | 粘贴结果、不挂载屏外 cell | ✅ 存量 | vnext-smoke #"context menu copy and paste…" #"oversized range copy…" |
| SM-12 | 真后端 sheet 元数据往返（增改删 / 重排） | worker 后端下操作 tab | 元数据 + 投影刷新 | ✅ 存量 | vnext-real-backend-smoke #"sheet add, rename, and delete…" #"sheet reorder…" |
| SM-13 | 真后端 name-box / Copy As / 状态栏聚合 | 选区→读 flavours / 聚合 | 剪贴板三 flavour、聚合值 | ✅ 存量 | vnext-real-backend-smoke #"name-box selection…" #"Copy As reads…" #"status-bar aggregates…" |
| SM-14 | 真后端双击编辑 commit/cancel + GoTo / 分列 | 原生双击；对话框往返 | 提交/取消后显示值 | ✅ 存量 | vnext-real-backend-smoke #"native double-click…" #"Go To and Text to Columns…" |
| SM-15 | 静态后端 Excel Table 创建 + 结构化引用 | Data 菜单建表；`=SUM(Table1[Q1])` | 表名发布、列和、非法选区诊断 | ✅ 存量 | excel-table-static §"static Excel Table create"（4 用例） |
| SM-16 | 静态后端 totals row 切换 | Data 菜单 toggle ×2；占位行冲突 | SUBTOTAL 行出现/清除、结构化诊断 | ✅ 存量 | excel-table-static §"static Excel Table totals row"（4 用例） |
| SM-17 | 回归钉：Enter 单 undo 条目 / Escape 无幻影条目 | 提交→1 次 undo；取消→undo | 一步清空、无幻影 | ✅ 存量 | regression #"TODO 1.2.1: one Enter commit…" #"TODO 1.2.1: undo after Escape…" |
| SM-18 | 回归钉：subscribe→set_formula 单次触发 | `?debug=1` 探针计数 | fireCount === 1 | ✅ 存量 | regression #"subscribe-then-set_formula fires…" |
| SM-19 | 回归钉：跨 sheet 读不失效缓存 | 3-Sheet Chain 巡回编辑 | cache badge 保持 clean | ✅ 存量 | regression #"cross-sheet read does not invalidate…" |
| SM-20 | 回归钉：TODAY() 本地日期无 UTC 漂移 | Formulas demo 输入 `=TODAY()` | serial/ISO 落在本地今天 ±1 天 | ✅ 存量 | regression #"TODAY()-style date evaluates…" |
| SM-21 | 回归钉：wasm 回调 panic 后实例存活 | debug knob 注入 panic | panic 上报 + 后续读写正常 | ✅ 存量 | regression #"JsCallbackListener panic surfaces…" |

## 缺口清单

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| SM-22 | 全部 14 个 demo 首屏 console.error 守卫 | 逐 demo 导航→等首屏结算（签名格/状态栏） | guardConsoleErrors 零泄漏 | 🆕 本轮 | demo-first-screen-guard.spec.ts（14 用例，数据驱动） |
| SM-23 | 冷启动路径（zh locale、无导航）首屏守卫 | `goto /` 不带 locale=en | wave5 active + A1="Region" + 零 console.error | 🆕 本轮 | demo-first-screen-guard.spec.ts #"default boot…" |
| SM-24 | 首屏 pageerror（未捕获异常）守卫 | 同 SM-22 但监听 `pageerror` | 零未捕获异常 | ⏳ P2 延后 | — 理由：helpers 守卫契约只覆盖 console.error；扩 pageerror 需评估 wasm worker 噪声面并新增公共 helper（本轮禁改 helpers.ts），另立专项 |
| SM-25 | demo 首屏耗时预算（冷启动性能钉） | `?debug=1` 探针计时 | 首屏耗时 < 阈值 | ⏳ P2 延后 | — 理由：探针类断言按计划 §5 仅限 perf-virtual/；阈值在 CI 共享 runner 上难稳定，归 perf-virtual 专项 |
