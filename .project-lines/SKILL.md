---
name: project-lines
description: "React Excel 完整产品的已确认主线：产品入口、React/UI-core 边界、Rust worker 数据链。先读本索引，再只读相关的 1–2 条线。2026-09-01 于 commit 5cd1132e 学得。"
---

# React Excel · 线索引

> 由 `learn-project` 于 commit `5cd1132eab3d82129510c783b5595450d04d5c82`
>（2026-09-01）学得。数字来自 `mechanical/` 与包内人工调用闭包；未确认内容不能驱动改动。

## 怎么用

- React 产品交互先读 `00-main-react-product.md`；框架桥接改动再读 `01-main-react-adapter.md`；
  数据、投影或 mutation 再读 `02-main-rust-worker.md`。
- 后续任务只打开相关 1–2 条线与实际配方文件，不重扫仓库。
- 收尾必须确认测试通过，且 diff 仍沿同一入口、归属、Rust worker 与 UI-core/backend 窄腰。

## 线

| 文件 | 线 | 类型 | 汇合点 | 状态 |
|---|---|---|---|---|
| `lines/00-main-react-product.md` | React 完整产品 | 主线 | `demo/App.tsx`、`RustWorksheet.tsx` | 部分确认 |
| `lines/01-main-react-adapter.md` | React/UI-core 桥接 | 主线 | `SpreadsheetUiProvider`、`src/index.ts` | 部分确认 |
| `lines/02-main-rust-worker.md` | Rust 数据读写 | 主线 | worker backend、RPC dispatcher | 部分确认 |

**公共层（不是线）：** `excel/spreadsheet-ui-core` 保存框架无关 UI 状态与命令；
`excel/solid-excel/src/adapter/worker` 提供中性 backend/RPC；React 产品只消费公开窄腰。

## 追线时发现的结构修正（交叉印证）

- 产品 runtime 实际消费 React 包 8/17 个公开运行时值；barrel 静态触达 18/18 个 `src` 文件，
  不能拿 bundle 可达性冒充产品调用闭包。
- 三条线独立确认工作簿真值只在 Rust；React/provider/UI-core 持有交互与投影状态，不复制 workbook。
- 产品与 Rust 两条线均确认 React demo 直接选择现成 lite Rust worker；不经过同时暴露 TS factory 的入口。

## 已确认的规则（负责人，2026-09-01）

- ✅ `react-excel` 的目标是完整 React Excel 产品，不是通用 adapter skeleton。
- ✅ React 产品只接现成 Rust worker；禁止接 TS core、TS runtime 或 fallback。
- ✅ 功能按单个可验收点推进；完成一个并提交后再开始下一个。
- ✅ 后续任务使用本 `project-lines`，不重复全仓摸索。

## 已确认的设计 / 遗留

- 当前 1000 行 demo 的打开、虚拟窗口、选择与单格编辑是产品基线，清理不能静默破坏。
- 9 个未被当前产品调用的旧 adapter surface 是首批遗留候选；它们及配套旧验证不会作为新功能样板。
- `worker-factory.ts`、TS worker、full WASM 是 Solid 其它宿主的“另一类”，不属于 React 产品清理范围。

## 机械证据

- 全仓 extractor 在 `excel/*` 未找到覆盖率 ≥60% 的单一 hub，因此三个窄腰由 import/call 路径人工追踪。
- `excel/react-excel`：72 个 tracked 文件；demo 24、src 18、test 21、e2e 5、包根 4。
- 产品调用闭包：demo runtime 21 + src 9 = 30/72；公开运行时值消费 8/17。
- worker backend 组合 20/20 端口族；dispatcher 注册 13 个 command handler。

## 文档与代码不一致

- `excel/react-excel/README.md` 与 `package.json` 仍把包描述为私有 adapter、明确“不是完整应用”；
  负责人已改变目标，应在旧文件清理时改成完整产品描述。
- README 漏写 pointer 独立子路径，也漏掉 standalone IME hook；二者属于将删除的旧 adapter 文档面。
- Solid README 只展示 factory 宿主方式，未记录 React 产品直接选择 Rust worker 的现役路径。

## 待确认

见 `questions.md`：只剩 1 条会改变本次删除范围的问题。

## 学习成本

| 线 | 打开文件数 | 产出行数 |
|---|---:|---:|
| React 产品 | 67 | 返修后 <120 |
| React adapter | 53 | 71 |
| Rust worker | 51 | 88 |

机械提取 4.5 秒；三条线并行追踪。
