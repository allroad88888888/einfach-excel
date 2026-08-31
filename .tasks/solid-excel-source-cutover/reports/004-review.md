# 004 独立审查：重建 Grid overlay 渲染边界

## 结论

**REJECTED**。Canvas 的挂载、renderer、绘制已形成文件边界，但本任务要求的 SVG geometry memo / SVG 图层渲染边界没有建立；当前改动主要依靠把 import、语句和 JSX 压成超长物理行来通过 `wc -l`。这属于 `one-file-one-thing` 所定义的假性行数收敛，不能视为完成“职责拆分”。

## 审查范围

- 任务文件：`.tasks/solid-excel-source-cutover/004-split-grid-overlay.md`
- 执行报告：`.tasks/solid-excel-source-cutover/reports/004-report.md`
- 指定 base `723082739d66140ac697a5a9c203a6fd99649d4a` 到当前工作区的范围 diff
- `git status --short` 所示的三个未跟踪匹配文件均已直接阅读：
  - `overlay-canvas-draw.ts`
  - `overlay-canvas-renderer.ts`
  - `overlay-types.ts`

没有重跑执行报告声称已运行的测试。

## 验收标准逐条判定

### 1. overlay 普通文件均不超过 300 物理行：✅

证据：当前文件分别为 `SpreadsheetGridOverlay.tsx` 40 行、`SpreadsheetGridOverlaySvg.tsx` 264 行、`overlay-canvas-draw.ts` 97 行、`overlay-canvas-renderer.ts` 29 行、`overlay-types.ts` 75 行，字面上满足验收命令的 `wc -l` 上限。

但这只是机械指标通过，不代表任务目标或单一职责规则通过。典型证据包括：

- `overlay-canvas-renderer.ts:12-25` 把字段、完整方法体、订阅表、snapshot 和 render 大量压到单行；29 行并不反映其实际复杂度。
- `overlay-canvas-draw.ts:21-96` 大量一行多语句/多操作，97 行同样是格式压缩结果。
- `SpreadsheetGridOverlaySvg.tsx:225-261` 把完整 SVG 图层节点压成单行，原 diff 的主要变化是删除换行和注释，而不是抽出图层职责。

### 2. 两个定向 Jest 文件全绿：✅

证据：执行报告记录 `2 suites、36 tests` 全绿。依照审查要求未重跑。范围 diff 中保留了既有 testid 和 Canvas/SVG 的主要图层顺序；没有发现足以推翻该报告结果的直接证据。

### 3. Solid Excel 全量 TypeScript 零错误：⚠️无法核实

执行报告明确记录该命令未通过，唯一所报错误位于本审查 diff 外的 `src-vnext/adapter/worker-protocol/table-filter.ts`。由于本审查只允许基于指定范围，无法判断清除该范围外阻断后 overlay 改动是否零错误；按要求不将范围外不可核实事项判为 ❌。

## 覆盖矩阵核对

### C-013 现役 Grid 可视层：✅

证据：Canvas 的绘制调用顺序在 `overlay-canvas-draw.ts:5-18` 明确排列；SVG 图层顺序在 `SpreadsheetGridOverlaySvg.tsx:222-261` 保留。执行报告所列 36 个定向测试覆盖 selection、freeze、merge、spill、formula reference、conditional format 与 marching ants，并已通过。此结论只说明现有可视行为有定向测试支持，不抵消下述结构质量问题。

### C-018 现役文件行数：❌

虽然 `wc -l` 的字面数值通过，但 C-018 在本任务中的目的明确是“使两个现有超限组件降到职责上限内”，且目标要求分离 SVG geometry memo 与 SVG 图层渲染。`SpreadsheetGridOverlaySvg.tsx:31-204` 仍同时负责 store 订阅/ResizeObserver 生命周期和全部 geometry memo，`:205-264` 又负责全部 SVG 图层渲染；文件无法用一句不含“和/以及”的话描述职责。以单行压缩规避物理行上限不构成职责收敛，因此该覆盖行不能认定完成。

## 质量发现

### Critical

无。

### Important

1. **SVG 拆分目标未完成。** `SpreadsheetGridOverlaySvg.tsx` 仍把 Solid 生命周期、状态订阅、尺寸同步、geometry memo、绘制辅助量与所有 SVG 图层放在同一组件。任务目标明确要求“分离……SVG geometry memo 与 SVG 图层渲染”，执行报告也承认尚未形成独立 geometry/layers 源文件。这不是可延期建议，而是本叶子任务的核心交付缺口。

2. **通过压缩物理行规避行数规则，显著降低可维护性。** `overlay-canvas-renderer.ts` 的类方法几乎全部成为单行，`overlay-canvas-draw.ts` 广泛使用分号拼接操作，SVG 的多数 `<rect>` 也被压为一行。常见改动需要在极长行中编辑，review diff 和冲突定位都会恶化；这违反“上限是天花板、按职责拆、禁止为凑行数打碎/压缩代码”的规则精神。应恢复正常格式，再按职责重新拆分并用格式化后的物理行数验收。

3. **Canvas 虽有文件边界，但实现同样呈现假性收敛。** `overlay-canvas-renderer.ts` 名称与职责大体成立，`overlay-canvas-draw.ts` 也集中于绘制；然而当前 29/97 行是压缩所得，不能据此证明普通文件在正常可读格式下仍低于 300 行。至少应正常展开类方法和绘制函数后重新执行 `wc -l`，若超限则按生命周期调度/快照或强内聚图层组继续拆分。

### Minor

1. `SpreadsheetGridOverlay.tsx:29-39` 也将 viewport 映射、ResizeObserver 回调、cleanup 和整个 `<canvas>` 压在少数超长行中；即使该文件本身很短，也应恢复仓库正常格式以保留可读 diff。

2. `overlay-types.ts` 同时承载公共视觉常量、Canvas context 契约、viewport 契约和 renderer snapshot 类型。它们目前都服务 overlay 边界，尚不足以单独判违规，但正常格式化后应再次用一句话测试和引用聚类测试确认是否需要拆出视觉常量。

## 修复后复审要点

- 把 SVG geometry/state 推导与 SVG 图层渲染拆成独立、命名明确的模块；顶层组件只负责组合与挂载生命周期。
- 恢复所有新增/大改文件的正常多行格式，禁止一行多语句和单行大型 JSX。
- 对格式化后的全部匹配文件重新执行 `wc -l`；超过 300 行时继续按职责拆分。
- 重跑两个定向 Jest；清除范围外 TypeScript 阻断后补跑全量 `tsc`。

## R1 复审

### 结论

**APPROVED**。首轮全部 Important/Minor 已修复或经正常格式化后确认不构成违规；本轮未发现新的阻断项。

### 复审范围

- 重新阅读任务文件、更新后的执行报告与首轮审查。
- 检查指定 base 到当前工作区的范围 diff。
- 通过 `git status --short` 核对并直接阅读全部五个未跟踪 `overlay-*` 文件：`overlay-canvas-draw.ts`、`overlay-canvas-renderer.ts`、`overlay-svg-geometry.ts`、`overlay-svg-layers.tsx`、`overlay-types.ts`。
- 依照要求未重跑执行报告声称已完成的 Jest、TypeScript 或 diff 检查。

### 原 Important 复核

1. **SVG 拆分目标未完成：✅ 已修复。** `SpreadsheetGridOverlaySvg.tsx:31-101` 现在只负责 Solid store 订阅、tick/size 生命周期、ResizeObserver 与 SVG 容器组合；`overlay-svg-geometry.ts:41-158` 专门把 store/viewport 状态推导为 geometry accessors；`overlay-svg-layers.tsx:18-201` 只消费 geometry 并按既有顺序渲染图层。geometry 模块接收现有 `Store`，没有创建第二个 store。三者均能用单一职责描述，且不是按图形拆成微文件。

2. **单行压缩规避行数规则：✅ 已修复。** Canvas renderer/draw、SVG 顶层/geometry/layers 以及类型文件均已恢复常规多行排版。直接阅读没有再发现一行承载完整方法体、一行多操作链或大型单行 JSX；超长行扫描也没有发现超过 120 字符的行。

3. **Canvas 假性收敛：✅ 已修复。** 正常排版后，`overlay-canvas-renderer.ts` 为 172 行，职责集中于订阅、帧调度、快照与 renderer 生命周期；`overlay-canvas-draw.ts` 为 271 行，职责集中于按既定顺序绘制 Canvas 图层。两者均在 300 行内，常见绘制改动与调度改动可分别落在对应文件。

### 原 Minor 复核

1. **Canvas 顶层组件压缩：✅ 已修复。** `SpreadsheetGridOverlay.tsx` 已恢复正常多行 viewport 映射、ResizeObserver/cleanup 和 JSX，共 77 行。

2. **`overlay-types.ts` 职责聚类疑虑：✅ 可接受。** 正常排版后文件为 109 行，内容均是 Canvas/SVG overlay 边界共享的视觉常量与数据契约；不存在两组互不相关的业务实现，也没有空洞 `utils/common` 命名。当前继续放在共享 overlay contract 文件内不构成单一职责违规。

### 指定补充项

- **格式化后行数：✅。** `SpreadsheetGridOverlay.tsx` 77 行、`SpreadsheetGridOverlaySvg.tsx` 101 行、`overlay-canvas-draw.ts` 271 行、`overlay-canvas-renderer.ts` 172 行、`overlay-svg-geometry.ts` 158 行、`overlay-svg-layers.tsx` 201 行、`overlay-types.ts` 109 行；全部普通文件均 ≤300 行。
- **`OverlayContext.fill` 类型：✅ 已修复。** `overlay-types.ts:48-68` 的 `OverlayContext` 在第 64 行重新声明 `fill(): void`。更新后的执行报告记录全量 `tsc` 零错误，依照要求未重跑。
- **回归证据：✅。** 更新后的执行报告记录两个定向 Jest suite、36 个测试全绿，并记录全量 TypeScript 零错误；依照要求未重跑。

### 覆盖矩阵更新

- **C-013：✅。** SVG layers 以明确顺序消费 geometry，Canvas draw 保留明确绘制顺序；执行报告记录覆盖 selection、freeze、merge、spill、formula-reference、conditional-format 与 marching ants 的 36 个定向测试通过。
- **C-018：✅。** Canvas 与 SVG 均已按真实职责建立边界，正常格式化后的全部审计文件均不超过 300 行。

### R1 质量发现

- Critical：无。
- Important：无。
- Minor：无。
