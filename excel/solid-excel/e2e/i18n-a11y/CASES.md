# 国际化 + 可访问性 — e2e cases

> 功能源码：src/i18n/（lingui + localeAtom）+ src/LocaleSwitcher.tsx；
> a11y 面向 src-vnext 全表面（axe-core WCAG 2.0/2.1 A+AA 门禁，基线见
> docs/online-excel-parity/A11Y_BASELINE.md）；对话框 Escape 语义见
> src-vnext/find-replace/、format-cells/、go-to/、named-ranges/ 各 Dialog 组件
> 存量 spec 行数超限登记（如有）：无（i18n 119 行、a11y-surfaces 236 行）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| IA-01 | EN 启动（?locale=en） | gotoApp | 标题/heading/aria-pressed | ✅ 存量 | i18n #"boots in EN" |
| IA-02 | EN→ZH 切换翻译 title/nav/demo heading | 点 中 | Einfach 表格/空白/公式 | ✅ 存量 | i18n #"clicking 中 translates app title, nav, and current demo heading" |
| IA-03 | ZH 下切 demo 保持 ZH catalog | 切 公式 demo | 公式示例 | ✅ 存量 | i18n #"switching demo while in ZH keeps the ZH catalog active" |
| IA-04 | 切回 EN 全恢复 | 中 → EN | 英文标题/导航复现 | ✅ 存量 | i18n #"switching back to EN restores English everywhere" |
| IA-05 | 重复点击当前 locale no-op | 点已激活 EN | 可见态不变 | ✅ 存量 | i18n #"clicking the already-active locale is a no-op" |
| IA-06 | axe WCAG 2.1 AA 扫描 7 个表面（grid/菜单/工具栏下拉/4 对话框） | 逐表面打开后 analyze | 无 critical/serious（KNOWN_ISSUES 白名单精确到节点） | ✅ 存量 | a11y-surfaces #"a11y — vNext surfaces (WCAG 2.1 AA)" 7 条 |
| IA-07 | sheet-tab strip role=tablist 含非 tab 子元素（已知缺陷） | axe include .sheet-tabs | violations 空 | ⚠️ 已知缺陷（存量 fixme） | a11y-surfaces #"sheet-tab strip: role=\"tablist\" owns non-tab buttons" |
| IA-08 | wave5 菜单栏/工具栏/nav 标签文案随 locale 往返切换 | EN→ZH→EN | Edit↔编辑、find-replace aria-label 中英互换 | 🆕 本轮 | i18n-vnext-surfaces.spec.ts |
| IA-09 | 打开的 find-replace 对话框：locale 切换后文案跟随且表单状态不丢、对话框不关 | 填 needle 后切 ZH 再切回 | 标题/tab 文案翻转，needle 值保留 | 🆕 本轮 | i18n-vnext-surfaces.spec.ts |
| IA-10 | vNext Worker demo 默认 ZH 启动，切 EN 生效（zh→en 方向） | 无 locale 参数进 worker demo | 文件↔File | 🆕 本轮 | i18n-vnext-surfaces.spec.ts |
| IA-11 | Escape 关闭 find-replace 对话框（wave5） | 工具栏开→Esc | dialog count 0 | 🆕 本轮 | dialog-escape-aria.spec.ts |
| IA-12 | Escape 关闭 Format Cells 对话框（wave5） | number-format→Custom→Esc | dialog count 0 | 🆕 本轮 | dialog-escape-aria.spec.ts |
| IA-13 | Go To：打开即聚焦输入框，Escape 关闭（worker demo 双端） | Edit 菜单 goTo→Esc | go-to-input 聚焦→dialog 消失 | 🆕 本轮 | dialog-escape-aria.spec.ts |
| IA-14 | Escape 关闭 Name Manager（worker demo） | 工具栏开→Esc | dialog count 0 | 🆕 本轮 | dialog-escape-aria.spec.ts |
| IA-15 | wave5 工具栏全部 toolbar-btn-* 具备非空 aria-label；对话框 role=dialog+aria-label | 枚举按钮属性 | aria-label 非空 | 🆕 本轮 | dialog-escape-aria.spec.ts |
| IA-16 | 对话框焦点陷阱 | — | — | ⏳ P2 延后 | find-replace/go-to/name-manager 均为非模态（Excel 语义，WCAG 对 modeless 不要求 trap），产品无 trap 实现；唯 Format Cells 声明 aria-modal="true" 却无焦点管理（SpreadsheetFormatCellsDialog.tsx:331），疑似 a11y 契约违背，待 dev server 恢复后实测确认再决定是否 ⚠️+fixme |
| IA-17 | Format Cells 标题/aria-label 硬编码 EN 不随 locale | — | — | ⏳ P2 延后 | 源码注释自认 "no i18n key exists yet"（SpreadsheetFormatCellsDialog.tsx:336），属已登记 TODO 而非新暴露 bug；补 i18n key 后连测试一起补 |
| IA-18 | locale 持久化（reload 保持） | — | — | ⏳ P2 延后 | 产品无持久层，i18n.spec.ts 头注明确"不是我们 ship 的特性" |

状态说明：新增 2 个 spec 共 8 用例已在本地 `EINFACH_E2E_REUSE_SERVER=1` 下
`--project=wasm` 与 `--project=ts` 各跑一遍，16/16 绿。IA-13 在两个 project 上语义一致
（edit.goTo 为 'always' 条目），不做 project 分支。IA-16 的 Format Cells
aria-modal 疑点已实测 Escape 关闭正常，但焦点陷阱缺失仍未单测（保持 ⏳ P2 登记）。
