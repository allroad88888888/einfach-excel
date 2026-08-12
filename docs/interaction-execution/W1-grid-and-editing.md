# W1：网格、编辑和内容复用

> 本波次所有模型先确认 W0 契约；没有 Atom 模型或命令边界问题时选“修复”，不借体验工作重新发明
> selection、editing、viewport、projection 或 history 的业务状态。

| 来源 Issue                               | 唯一模型                               | 判定 | 独占模块                                                                            | 前置                   | 模型交付                                                                       |
| ---------------------------------------- | -------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| UI-101 首屏与初始焦点                    | `model-101-focus`                      | 修复 | `src-vnext/grid/focus-*`、`SpreadsheetGridView.tsx`                                 | IX-001、IX-002、IX-005 | 定义首次进入、切 Sheet、编辑结束三种焦点路径；不改选择事实。                   |
| UI-102 滚动与视口连续性                  | `model-102-viewport`                   | 修复 | `src-vnext/grid/scroll-*`、`grid-projection-controller.ts`                          | IX-002                 | 保留锚定算法，修复滚动/投影连续性；不改 projection contract。                  |
| UI-103 鼠标与多区域选择                  | `model-103-selection`                  | 修复 | `src-vnext/grid/grid-selection.ts`、`grid-pointer-selection.ts`                     | IX-002                 | 只接 pointer 到 selection Atom；不改变 selection 语义。                        |
| UI-104 键盘导航                          | `model-104-navigation`                 | 修复 | `src-vnext/grid/grid-keyboard-controller.ts`                                        | IX-002、UI-101         | 仅保留导航、焦点和视口跟随；把快捷键转交所属 feature adapter。                 |
| UI-105 表头、拖拽尺寸和自动适配          | `model-105-headers`                    | 修复 | `src-vnext/grid/grid-resize-controller.ts`、`grid-auto-fit-controller.ts`、表头组件 | IX-002                 | 将表头选择与尺寸操作分层；尺寸仍写 viewport Atom。                             |
| UI-106 冻结、合并和大纲                  | `model-106-grid-geometry`              | 修复 | `src-vnext/grid/grid-layout.ts`、`SpreadsheetGridOutline.tsx`                       | IX-002                 | 按 freeze/merge/outline 三个 presenter 拆分；不复制 projection 数据。          |
| UI-107 特殊单元格和提示层                | `model-107-cell-overlays`              | 修复 | `src-vnext/grid/SpreadsheetGridOverlay*.tsx`、cell display presenter                | IX-002                 | 让 spill、验证、条件格式、rich-value 可独立展示；不建每 cell Atom。            |
| UI-201 单元格直接编辑                    | `model-201-editor`                     | 修复 | `src-vnext/grid/SpreadsheetGridCellEditor.tsx`、`grid-editing-controller.ts`        | IX-002、IX-005         | 调整 edit/commit/cancel/focus，保留 editing Atom 生命周期。                    |
| UI-202 公式栏与名称框                    | `model-202-formula-bar`                | 修复 | `src-vnext/formula-bar/**`                                                          | IX-001、IX-005、UI-201 | 只交付公式栏编辑；名称框地址跳转改由 UI-406 模型处理。                         |
| UI-203 公式引用拾取                      | `model-203-formula-reference`          | 修复 | `src-vnext/grid/grid-formula-reference*`、`formula-autocomplete` 适配层             | IX-002、UI-201         | 统一引用拾取、取消和焦点归还；不改 parser。                                    |
| UI-204 公式建议和函数提示                | `model-204-autocomplete`               | 修复 | `src-vnext/formula-autocomplete/**`                                                 | IX-005、UI-201         | 合并公式栏/单元格编辑器的候选键盘适配；anchor 仍可为 DOM 临时态。              |
| UI-205 复制、剪切和普通粘贴              | `model-205-clipboard`                  | 修复 | `src-vnext/grid/grid-clipboard.ts`、`provider/clipboard-dispatch.ts`                | IX-001、IX-002         | 收窄浏览器 Clipboard 副作用网关；不改 core paste plan。                        |
| UI-520 Context menu Clipboard 边界       | `model-520-context-menu-clipboard`     | 修复 | `src-vnext/context-menu/context-menu-clipboard-*`                                   | UI-205                 | 右键菜单复用统一浏览器 Clipboard adapter；不复制产品状态或失败状态机。         |
| UI-522 Context menu Clipboard 浏览器验收 | `model-522-context-menu-clipboard-e2e` | 验收 | 新增 `e2e/clipboard/context-menu-clipboard.spec.ts`                                 | UI-205、UI-520         | 用真实浏览器权限与用户手势验证右键 Clipboard 路径；不修改产品状态。            |
| UI-523 Grid Tab 边界浏览器验收           | `model-523-grid-tab-boundary-e2e`      | 验收 | 新增 `e2e/grid/grid-tab-boundary.spec.ts`                                           | UI-101                 | 验证内部 Tab 选择移动与首末单元格的原生焦点交接；不修改选择或键盘命令。        |
| UI-524 填充柄 Pointer 浏览器验收         | `model-524-fill-pointer-e2e`           | 验收 | 新增 `e2e/grid/grid-fill-pointer-lifecycle.spec.ts`                                 | UI-207、UI-511         | 验证拖拽取消不残留预览且忽略非发起 pointer；不修改填充或选择状态机。           |
| UI-525 公式栏 IME 浏览器验收             | `model-525-formula-ime-e2e`            | 验收 | 新增 `e2e/formula-bar/formula-bar-ime.spec.ts`                                      | UI-202、UI-510         | 验证合成期间 Enter/Escape 不触发编辑命令；不修改编辑或 locale Atom。           |
| UI-206 选择性粘贴                        | `model-206-paste-special`              | 修复 | `src-vnext/paste-special/**`、`ui-core/src/paste-special/**`                        | IX-005、UI-205         | 统一入口、焦点和 capability 不可用反馈；保留会话 Atom。                        |
| UI-207 填充柄和序列填充                  | `model-207-auto-fill`                  | 修复 | `src-vnext/grid/grid-fill-controller.ts`、填充 presenter                            | IX-002                 | 分清拖拽、双击、命令入口；复用既有 auto-fill command。                         |
| UI-208 格式刷                            | `model-208-format-painter`             | 修复 | `src-vnext/format-painter/**`、专属 grid cursor adapter                             | IX-002                 | 确保正式挂载路径和 cursor adapter；不改 painter 状态机。                       |
| UI-209 撤销、重做和历史                  | `model-209-history`                    | 修复 | `src-vnext/history/**`、`provider/history-dispatch.ts`                              | IX-001、IX-006         | 把 retry 所有权收回 Provider 契约，覆盖各 mutation 生产者；不改 history core。 |
| UI-210 Copy As                           | `model-210-copy-as`                    | 修复 | `src-vnext/provider/copy-as-dispatch.ts`、`copy-as/**`                              | IX-001、IX-002         | 文本/富文本与图片路径分别验证；不改 core encoder。                             |

每个模型需要给出对应组件或 core 测试，触及真实浏览器 Clipboard、pointer 或焦点时再补 Playwright 路径。

## 已完成补充 Issue

### UI-522 Context menu Clipboard 浏览器验收

- 状态：已完成（`dbe6cb9`）
- 目标：验证 Wave5 右键复制、剪切与粘贴实际走浏览器 Clipboard，覆盖权限、用户手势和读写失败后既有 Atom 反馈。
- 非目标：不改变 Core Clipboard 状态机、网格键盘 Clipboard 路径或浏览器 adapter；不修改存量 oversized E2E audit 文件。
- 前置：UI-205、UI-520；产品路径已统一到 `browser-clipboard`。
- Owner / 模型：`model-522-context-menu-clipboard-e2e`。
- 独占文件：新增 `excel/solid-excel/e2e/clipboard/context-menu-clipboard.spec.ts`；如审计证明需要产品修复，先回报精确扩展范围。
- 验收：WASM 与 TS Playwright 均 3/3 通过，覆盖复制、剪切、粘贴和拒绝读取；文件 105 行；不新增产品状态。

### UI-523 Grid Tab 边界浏览器验收

- 状态：已完成（`94c269f`）
- 目标：在 Wave5 的真实浏览器中验证内部 Tab/Shift+Tab 更新 Atom 投影，首末单元格则不拦截浏览器原生焦点移动。
- 非目标：不改变选择 Atom、键盘 command 或编辑器生命周期。
- 前置：UI-101；JSDOM 已覆盖 event 是否 preventDefault，本项补充浏览器焦点结果。
- Owner / 模型：`model-523-grid-tab-boundary-e2e`。
- 交付：滚动 viewport 与 resize/filter/fill/outline 导航控件退出顺序 Tab；富链接保留原生 Tab 可达性。
- 验收：WASM 与 TS Playwright 均 5/5 通过；Jest 5/5；新增 E2E 129 行；不新增产品状态。

### UI-524 填充柄 Pointer 浏览器验收

- 状态：已完成（`9474931`）
- 目标：在真实浏览器中验证 fill handle 拖拽的正常提交与 `pointercancel` 清理，确保不残留 preview，且非发起 pointer 不可提交。
- 非目标：不改变 auto-fill command、选择 Atom、DOM pointer session 或浏览器适配器。
- 前置：UI-207、UI-511；JSDOM 已覆盖 pointer identity、capture 和终止事件，本项补充浏览器路径。
- Owner / 模型：`model-524-fill-pointer-e2e`。
- 独占文件：新增 `excel/solid-excel/e2e/grid/grid-fill-pointer-lifecycle.spec.ts`；如发现产品语义缺陷，先回报精确范围。
- 验收：WASM 与 TS Playwright 均 3/3 通过；文件 153 行；不新增产品状态。

### UI-525 公式栏 IME 浏览器验收

- 状态：已完成（`d90c22c`）
- 目标：验证真实浏览器的公式栏输入法合成期间，Enter/Escape 均不提交或取消；合成结束后 Enter 恢复提交。
- 非目标：不改变 editing、formula bar 或 locale Atom。
- 前置：UI-202、UI-510。
- Owner / 模型：`model-525-formula-ime-e2e`。
- 验收：WASM 与 TS Playwright 均 1/1 通过；文件 94 行；不新增产品状态。

## 已完成

| Issue                                    | Commit    | 已验证交付                                                                                                                                 | 保留边界                                                                                                                |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| UI-101 首屏与初始焦点                    | `2a2522b` | 空选择初始化 A1、root `grid` 语义、`aria-activedescendant`、内部 Tab 与边界 Tab、点击焦点回归。                                            | UI-523 已补原生浏览器 Tab 回归；编辑取消后的焦点归位由 UI-201 处理。                                                    |
| UI-102 滚动与视口连续性                  | `d661294` | 投影缓存以 sheetId 分区；异步几何变更按既有锚点复位并重投影，物理滚动保持在表面边界内。                                                    | JSDOM 的 canvas `getContext` 提示来自既有 Overlay；真实浏览器滚动仍需 E2E。                                             |
| UI-103 鼠标与多区域选择                  | `71cc53e` | Shift/Ctrl+Shift 扩展、pointer 拖选和合并单元格锚点保持同一 selection Atom 事实。                                                          | 矩形中间穿越但端点均未命中的独立合并区域，需额外的可枚举 merge-range seam。                                             |
| UI-104 键盘导航                          | `39943c5` | 复用既有 Atom 键盘导航，补 Ctrl/Cmd+方向键数据边缘跳转后的视口跟随。                                                                       | 数据边缘目标仍由既有 core resolver 决定。                                                                               |
| UI-105 表头、拖拽尺寸和自动适配          | `58ab5a5` | 尺寸边界、pointer 取消和写入失败反馈；resize handle 不再误触发行/列选择。                                                                  | 后端尺寸写入失败时保留乐观显示，并通过既有错误生命周期反馈；本项未引入回滚策略。                                        |
| UI-106 冻结、合并和大纲                  | `e4fecf8` | 冻结边界只依赖 Atom 几何；合并范围、冻结样式和大纲滚动锚点职责分离，行列折叠均保留逻辑位置。                                               | 覆盖格的锚点完全在投影窗外时，现有 adapter 缺少完整 merge span，无法推导完整范围。                                      |
| UI-107 特殊单元格和提示层                | `7c85b95` | 保持 spill、条件格式与验证的既有 Atom 投影；安全 rich URL 成为可键盘操作的链接，事件不再被 cell 选择吞掉。                                 | 713 行 canvas Overlay 和 486 行 SVG Overlay 未触碰：现有投影已满足本项，未来若修改应按职责拆分。                        |
| UI-201 单元格直接编辑                    | `8494b3f` | Escape 事务取消、IME 边界、拒绝提交后的 draft 保留和 ARIA 错误反馈。                                                                       | 公式栏的编辑会话由 UI-202 串行处理。                                                                                    |
| UI-202 公式栏与名称框                    | `03e5ce4` | 公式栏复用 editing Atom；IME 合成态不误提交/取消，拒绝提交保留草稿与焦点，并通过 ARIA 呈现 lifecycle 错误。                                | UI-525 已补两后端浏览器合成态路径；名称框地址跳转仍由 UI-406。                                                          |
| UI-203 公式引用拾取                      | `02c33d5` | 引用拾取的 pointer id、capture、取消和焦点归还被隔离为 DOM adapter；插入位置继续由既有引用 Atom token 决定。                               | 输入层的全局 Escape 路由仍须在单独授权的调用链中处理，未改变普通 selection。                                            |
| UI-204 公式建议和函数提示                | `34f4231` | 编辑焦点在单元格与公式栏间切换时立即重锚，离开编辑输入即隐藏 overlay，并补 listbox 名称。                                                  | 候选键盘命令继续由既有公式栏和单元格编辑器各自处理。                                                                    |
| UI-205 复制、剪切与普通粘贴              | `1e8b657` | rich MIME、HTML-only 表格粘贴、`writeText` 与 textarea fallback；状态仍由既有 clipboard Atom 拥有。                                        | UI-522 已覆盖右键浏览器路径；操作系统级权限策略仍须由实际宿主环境验收。                                                 |
| UI-520 Context menu Clipboard 边界       | `fc786a8` | 右键复制、剪切和粘贴统一使用 rich/plain/legacy 降级的浏览器 Clipboard adapter；读写失败仍回写既有 clipboard Atom，剪切写失败不清除单元格。 | UI-522 已覆盖浏览器 permission/user-activation 路径；真实 OS 权限提示不由 Playwright 伪造。                             |
| UI-206 选择性粘贴                        | `930c780` | 在不改变公开 Atom/命令 API 下，将 895 行入口拆为会话快照、状态、命令、确认和恢复职责。                                                     | 严格 ACK、错误恢复、refresh-only retry 与宿主路径沿用现有回归；未增加新交互能力。                                       |
| UI-207 填充柄和序列填充                  | `5212f96` | pointer id/capture、取消、失焦和隐藏清理；预览、提交、错误仍由既有 Atom 链路管理。                                                         | UI-524 已覆盖浏览器拖拽和精确 `pointercancel`；真实 OS lost-capture/visibility 路径仍需平台验收。                       |
| UI-522 Context menu Clipboard 浏览器验收 | `dbe6cb9` | 两后端均验证右键复制、剪切、粘贴与拒绝读取，产品状态仍由既有 clipboard Atom 拥有。                                                         | OS 级权限提示与浏览器激活策略仍由最终宿主环境决定。                                                                     |
| UI-523 Grid Tab 边界浏览器验收           | `94c269f` | 两后端验证内部选择移动、A1/P50 边界焦点、导航控件退出 Tab 链；富链接仍可获得原生键盘焦点。                                                 | 带富链接的单元格是有意保留的独立 Tab 停靠，不属于 Grid 导航控件。                                                       |
| UI-524 填充柄 Pointer 浏览器验收         | `9474931` | 两后端验证填充提交、同一 pointer 的取消清理与外来 pointer 隔离。                                                                           | Playwright 从真实鼠标会话取得 id 后派发精确取消事件，不能替代各 OS 的底层触控驱动。                                     |
| UI-525 公式栏 IME 浏览器验收             | `d90c22c` | 两后端验证 composition 期间 Enter/Escape 不派发命令，composition 结束后 Enter 恢复提交。                                                   | 仍建议在目标 OS 的实际输入法引擎上做人工验收。                                                                          |
| UI-208 格式刷                            | `a234ca5` | 每个 Grid 自动挂载格式刷 host，Store 引用计数避免重复订阅；每个 grid 的 cursor 只映射自身 Atom 状态。                                      | 既有格式刷测试 635 行，因本项仅小型断言迁移而未擅自拆分。                                                               |
| UI-209 撤销、重做和历史                  | `5d5ca8b` | Timeline 将 history lifecycle 映射到统一反馈表面；重试只刷新历史，记录前要求 undo/redo 都可用。                                            | 尚存直接调用 `pushHistoryAtom` 的 mutation producer，需后续迁往 `recordHistoryEntry` 才能受同一 capability guard 覆盖。 |
| UI-210 Copy As                           | `37b03e8` | 文字、PNG、浏览器剪贴板和宿主渲染各有 adapter；投影/编码/渲染失败都写入既有 Copy As Atom，保留成功快照。                                   | 当前 core/menu 没有公式或 CSV 格式选择契约，未在此项越界增加。                                                          |
