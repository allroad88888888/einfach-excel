# W1：网格、编辑和内容复用

> 本波次所有模型先确认 W0 契约；没有 Atom 模型或命令边界问题时选“修复”，不借体验工作重新发明
> selection、editing、viewport、projection 或 history 的业务状态。

| 来源 Issue | 唯一模型 | 判定 | 独占模块 | 前置 | 模型交付 |
| --- | --- | --- | --- | --- | --- |
| UI-101 首屏与初始焦点 | `model-101-focus` | 修复 | `src-vnext/grid/focus-*`、`SpreadsheetGridView.tsx` | IX-001、IX-002、IX-005 | 定义首次进入、切 Sheet、编辑结束三种焦点路径；不改选择事实。 |
| UI-102 滚动与视口连续性 | `model-102-viewport` | 修复 | `src-vnext/grid/scroll-*`、`grid-projection-controller.ts` | IX-002 | 保留锚定算法，修复滚动/投影连续性；不改 projection contract。 |
| UI-103 鼠标与多区域选择 | `model-103-selection` | 修复 | `src-vnext/grid/grid-selection.ts`、`grid-pointer-selection.ts` | IX-002 | 只接 pointer 到 selection Atom；不改变 selection 语义。 |
| UI-104 键盘导航 | `model-104-navigation` | 修复 | `src-vnext/grid/grid-keyboard-controller.ts` | IX-002、UI-101 | 仅保留导航、焦点和视口跟随；把快捷键转交所属 feature adapter。 |
| UI-105 表头、拖拽尺寸和自动适配 | `model-105-headers` | 修复 | `src-vnext/grid/grid-resize-controller.ts`、`grid-auto-fit-controller.ts`、表头组件 | IX-002 | 将表头选择与尺寸操作分层；尺寸仍写 viewport Atom。 |
| UI-106 冻结、合并和大纲 | `model-106-grid-geometry` | 修复 | `src-vnext/grid/grid-layout.ts`、`SpreadsheetGridOutline.tsx` | IX-002 | 按 freeze/merge/outline 三个 presenter 拆分；不复制 projection 数据。 |
| UI-107 特殊单元格和提示层 | `model-107-cell-overlays` | 修复 | `src-vnext/grid/SpreadsheetGridOverlay*.tsx`、cell display presenter | IX-002 | 让 spill、验证、条件格式、rich-value 可独立展示；不建每 cell Atom。 |
| UI-201 单元格直接编辑 | `model-201-editor` | 修复 | `src-vnext/grid/SpreadsheetGridCellEditor.tsx`、`grid-editing-controller.ts` | IX-002、IX-005 | 调整 edit/commit/cancel/focus，保留 editing Atom 生命周期。 |
| UI-202 公式栏与名称框 | `model-202-formula-bar` | 修复 | `src-vnext/formula-bar/**` | IX-001、IX-005、UI-201 | 只交付公式栏编辑；名称框地址跳转改由 UI-406 模型处理。 |
| UI-203 公式引用拾取 | `model-203-formula-reference` | 修复 | `src-vnext/grid/grid-formula-reference*`、`formula-autocomplete` 适配层 | IX-002、UI-201 | 统一引用拾取、取消和焦点归还；不改 parser。 |
| UI-204 公式建议和函数提示 | `model-204-autocomplete` | 修复 | `src-vnext/formula-autocomplete/**` | IX-005、UI-201 | 合并公式栏/单元格编辑器的候选键盘适配；anchor 仍可为 DOM 临时态。 |
| UI-205 复制、剪切和普通粘贴 | `model-205-clipboard` | 修复 | `src-vnext/grid/grid-clipboard.ts`、`provider/clipboard-dispatch.ts` | IX-001、IX-002 | 收窄浏览器 Clipboard 副作用网关；不改 core paste plan。 |
| UI-206 选择性粘贴 | `model-206-paste-special` | 修复 | `src-vnext/paste-special/**`、`ui-core/src/paste-special/**` | IX-005、UI-205 | 统一入口、焦点和 capability 不可用反馈；保留会话 Atom。 |
| UI-207 填充柄和序列填充 | `model-207-auto-fill` | 修复 | `src-vnext/grid/grid-fill-controller.ts`、填充 presenter | IX-002 | 分清拖拽、双击、命令入口；复用既有 auto-fill command。 |
| UI-208 格式刷 | `model-208-format-painter` | 修复 | `src-vnext/format-painter/**`、专属 grid cursor adapter | IX-002 | 确保正式挂载路径和 cursor adapter；不改 painter 状态机。 |
| UI-209 撤销、重做和历史 | `model-209-history` | 修复 | `src-vnext/history/**`、`provider/history-dispatch.ts` | IX-001、IX-006 | 把 retry 所有权收回 Provider 契约，覆盖各 mutation 生产者；不改 history core。 |
| UI-210 Copy As | `model-210-copy-as` | 修复 | `src-vnext/provider/copy-as-dispatch.ts`、`copy-as/**` | IX-001、IX-002 | 文本/富文本与图片路径分别验证；不改 core encoder。 |

每个模型需要给出对应组件或 core 测试，触及真实浏览器 Clipboard、pointer 或焦点时再补 Playwright 路径。

## 已完成

| Issue | Commit | 已验证交付 | 保留边界 |
| --- | --- | --- | --- |
| UI-101 首屏与初始焦点 | `2a2522b` | 空选择初始化 A1、root `grid` 语义、`aria-activedescendant`、内部 Tab 与边界 Tab、点击焦点回归。 | 原生浏览器的跨控件 Tab 顺序仍需 E2E；编辑取消后的焦点归位由 UI-201 处理。 |
| UI-103 鼠标与多区域选择 | `71cc53e` | Shift/Ctrl+Shift 扩展、pointer 拖选和合并单元格锚点保持同一 selection Atom 事实。 | 矩形中间穿越但端点均未命中的独立合并区域，需额外的可枚举 merge-range seam。 |
| UI-205 复制、剪切与普通粘贴 | `1e8b657` | rich MIME、HTML-only 表格粘贴、`writeText` 与 textarea fallback；状态仍由既有 clipboard Atom 拥有。 | Context menu 的旧直连 Clipboard 路径待其自身 Issue 迁移；真实浏览器权限/手势路径需 E2E。 |
