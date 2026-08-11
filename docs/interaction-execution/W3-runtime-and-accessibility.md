# W3：运行时、可访问性和环境适配

> 这一波不把 Worker 或 DOM 临时测量强塞进 Atom。原则是：用户可见的期望、进度、错误和恢复由 Atom
> 持有；不可序列化的运行时句柄由每工作簿 runtime 持有。

| 来源 Issue | 唯一模型 | 判定 | 独占模块 | 前置 | 模型交付 |
| --- | --- | --- | --- | --- | --- |
| UI-501 批注线程 | `model-501-comments` | 重构后修复 | `src-vnext/comments/**`、`ui-core/src/comments/**` | IX-005 | 拆超限 core，补批注焦点/提交闭环；草稿继续为 Atom。 |
| UI-502 协作 Presence | `model-502-presence` | 修复 | `src-vnext/presence/**`、`ui-core/src/presence/**` | IX-001、IX-002 | 验证 transport/布局接线和覆盖层，不重建 remote cursor Atom。 |
| UI-503 保护和解锁 | `model-503-protection` | 重构后修复 | `src-vnext/protection/**`、`ui-core/src/protection/**` | IX-005 | 拆超限 core，统一解锁 dialog 交互和错误恢复。 |
| UI-504 打印预览 | `model-504-print` | 修复 | `src-vnext/print/**`、`ui-core/src/print/**` | IX-005 | 补 focus return、打印动作和语义标记；不改 print state。 |
| UI-505 通用 dialog / popover | `model-505-overlay-rollout` | 修复 | 每次只迁一个 `src-vnext/<feature>/**` surface | IX-005 | 以串行批次迁移既有浮层；不得并发改同一 feature surface。 |
| UI-506 状态栏、通知和诊断 | `model-506-feedback` | 补建 | `src-vnext/{status-bar,diagnostics,feedback}/**`、对应 core 模块 | IX-006 | 让诊断 Atom 产生可操作反馈；状态栏不承担 toast 的隐式替代。 |
| UI-507 初始化、切换和能力呈现 | `model-507-workbook-lifecycle` | 修复 | `src-vnext/provider/**` 的后续专属 batch | IX-001 | 统一 capability projection；禁止功能叶子各自 capture capability。 |
| UI-508 加载、中断和恢复 | `model-508-recovery` | 补建 | `src-vnext/recovery/**`（新）、`feedback/**` | IX-006 | 显示既有 idle/loading/error/retry Atom，不重做 core recovery。 |
| UI-509 键盘和读屏 | `model-509-a11y` | 修复 | `src-vnext/a11y/**`（新）与串行 surface adapters | IX-002、IX-005、UI-303 | 建立键盘/ARIA 契约并按 grid→menu→dialog 迁移。 |
| UI-510 国际化和 IME | `model-510-i18n-ime` | 修复 | `src-vnext/i18n-adapter/**`（新）、相关翻译测试 | IX-001、UI-104 | 覆盖非中英 locale、输入法组合与格式化；保留 locale Atom 同步。 |
| UI-511 窄屏、触控和触控板 | `model-511-responsive-input` | 重构后修复 | `src-vnext/responsive/**`（新）、专属 CSS | IX-002、IX-004、IX-005 | 定义响应式 shell 与 pointer/coarse 策略；不在各 dialog 分散硬编码。 |
| UI-512 Sheet Tabs ARIA 结构 | `model-512-sheet-tabs-a11y` | 修复 | `src-vnext/sheet-tabs/**`、专属交互与 Axe 回归 | UI-301、UI-509 | 修正 `tablist` 内嵌非 tab 控件的结构，同时保留重排和键盘路径。 |

## 验收顺序

1. 每个模型先跑其现有领域测试，确认基线；再写缺失测试。
2. 任何重新绑定焦点、键盘或 pointer 的节点必须补端到端路径和负向路径。
3. W3 结束后另安排独立模型跑全量 lint、类型、核心 Jest 和 Playwright，再由根节点审阅所有 diff。

## 已完成

### UI-501 批注线程

- Commit：`32ef6f5`。
- 原 1,093 行评论 Core 状态机按 editor、快照、预留、生命周期和执行职责拆分；产品草稿、会话、提交、错误与 retry 继续只由 Atom 持有，最大本次文件 235 行。
- 宿主补齐单元格锚定、滚动/缩放重定位、初始焦点、Tab 循环、Escape、焦点归还和 ARIA。只有预派发失败可安全 Retry；结果未知继续阻断重复提交。
- 59 项定向与包边界回归、Core/宿主/根 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过。后端没有读取评论线程的端口，因而没有伪造线程列表；多 grid 同坐标时仍优先活动单元格。

### UI-503 保护和解锁

- Commit：`433aa7c`。
- 解锁对话框补齐密码首焦点、Tab 焦点循环、Escape/关闭的 opener 归还、验证失败回焦，以及错误的 ARIA 关联；Core 解锁会话、密码和异步验证仍是既有 Atom。
- 67 项 Core/宿主/焦点回归、范围内 ESLint、Prettier 与 diff 检查通过；所有本次文件不超过 300 行。完成时全量类型检查一度被并行 W3 临时改动阻断，UI-501 收口后已由其 Core/宿主/根检查复验通过。

### UI-504 打印预览

- Commit：`5645202`。
- 打印预览补齐模态语义、初始焦点、Tab 循环、Escape/焦点归还和明确的浏览器 `window.print()` 动作；开关与打印配置仍消费既有 print Atom，DOM helper 不保存产品状态。
- 27 项 print Core/宿主回归、范围内 ESLint、Prettier 与 diff 检查通过，所有本次文件不超过 300 行。`pageSetupDialogOpenAtom` 目前没有已挂载的页面设置编辑器，故该按钮只安全写入现有状态；页面设置 UI 需独立 Issue 实现。

### UI-502 协作 Presence

- Commit：`a9456a1`。
- Core 只接受已 join 且 Sheet 与选区一致的远端 cursor；覆盖层默认投影 `workspaceSessionAtom.activeSheetId`，并以 `aria-hidden` 保持纯视觉装饰不干扰读屏。
- 24 项 Core/宿主定向回归、Core TypeScript、范围内 ESLint、Prettier 与 diff 检查通过，改动均不超过 300 行。
- Provider 的实际订阅/解绑不在 Presence presenter 重造，已经由 UI-507 接管；Chrome 没有 canonical 几何 resolver、grid marker 没有身份标签，留给拥有接线范围的后续 Issue。

### UI-506 状态栏、通知和诊断

- Commit：`c25f699`。
- 新增 `dismissDiagnosticAtom`，按对象身份只关闭一条诊断，避免相同 ID 的多条记录被误清；反馈表面接受调用方持有的 lifecycle dismiss 回调，retry 仍由调用方持有。
- 36 项诊断/反馈/状态栏定向回归、Core 构建和宿主 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过，所有本次文件不超过 300 行。
- 当前没有 Provider 或功能入口挂载诊断/反馈组件；该全局可见性装配必须由拥有入口的后续 Issue 负责，不能让状态栏冒充隐式 toast。

### UI-507 初始化、切换和能力呈现

- Commit：`6122d5d`。
- `SpreadsheetBackend` 运行时句柄移出 Atom，改由 Provider Context 的稳定转发端口承载；Atom 只持有工作簿 session、`idle/initializing/ready/failed` 生命周期、错误和九项 primitive capability 投影。
- Provider 统一处理 initial/post-ready capability capture、旧异步结果代际守卫、Presence subscribe/rebind/unmount cleanup；不伪造本地 selection 到远端 Presence 的发布协议。
- 38 项 Provider 回归、宿主 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过。原 538 行 provider 测试迁出 backend-port 场景后为 474 行，仍是存量混合测试的独立拆分债务；六处功能叶子的重复 capability capture 已列入 provider README，留待拥有这些 feature 的迁移批次。

### UI-505 通用 dialog / popover（Paste Special 批次）

- Commit：`6d49a39`。
- Paste Special 宿主移除局部 document Escape effect，改用既有 `useOverlayInteraction` 统一初始焦点、Tab 循环、Escape 与 opener 焦点归还；可关闭条件和关闭动作仍由 Paste Special Core Atom 判定。
- 27 项 Paste Special 回归、宿主 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过。两份存量 Paste 测试分别为 489/308 行，未在此次交互迁移中顺手拆分。

### UI-508 加载、中断和恢复

- Commit：`b18467a`。
- 新 recovery 表面仅读取既有工作簿 lifecycle Atom：idle/ready 静默、initializing 呈现 loading、failed 呈现 error；不创建本地产品状态，也不虚构 retry/cancel 命令。
- 13 项 recovery/Provider 定向回归、宿主 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过，所有新增文件不超过 117 行。它尚未接到工作簿宿主入口：当前不存在可安全复用的后端重绑/retry Atom，需由拥有恢复动作的后续 Issue 明确接线。

### UI-509 键盘和读屏（契约批次）

- Commit：`b88c091`。
- 建立无状态 DOM 审计契约，覆盖 Grid 唯一 tab stop、行列计数和 active descendant，Menu 的 trigger/item/popup 关联，以及 Dialog 的名称、模态和焦点入口；不接管既有 feature 焦点逻辑。
- 6 项正反例、Core/宿主 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过，所有新增文件不超过 194 行。
- 审计发现 Sheet Tabs 的 `tablist` 含 Add Sheet 和 Move 等非 tab 子控件，现有 Axe 用例已标记 `aria-required-children`；该真实结构缺口交由 UI-512 串行修复，避免跨 feature 越界。

### UI-510 国际化和 IME

- Commit：`ddab37b`。
- `localeAtom` 以 BCP-47 display tag 为唯一权威，Lingui catalog locale 仅是 en/zh 的派生；Provider 把 tag 投影到既有 Core workbook locale Atom，de-DE 格式化回归已覆盖。
- Grid cell editor 与 Formula Bar 消费真实 composition DOM 生命周期，组合输入中不会由 Enter/Escape 误提交或误取消；DOM session 不进入产品 Atom。
- 15 项 locale/IME/Provider 定向回归、宿主 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过。Lingui 文案仍只带 en/zh，Core parser 也只覆盖部分 locale tag；本批不改 Core/backend/API。

### UI-511 窄屏、触控和触控板

- Commit：`9102d87`。
- 审计确认 Grid viewport 和 Toolbar 已有原生滚动；真正的触控缺口在拖选 pointer 生命周期。拖选现锁定 initiating pointer，并对 `pointercancel`、blur、页面隐藏和 lost capture 清理，通过既有 `cancelPointerAtom` 回到 idle。
- 7 项新旧 Grid 选择回归、宿主 TypeScript、范围内 ESLint、Prettier 与 diff 检查通过，最大本次文件 156 行。尚未做真实移动设备/桌面触控板 E2E，JSDOM 覆盖的是 DOM 生命周期。
