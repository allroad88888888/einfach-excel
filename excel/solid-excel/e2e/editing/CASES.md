# editing — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/editing/（editingSessionAtom / start / commit / cancel
> + mutation-gateway）+ keyboard/index.ts（F2 / Backspace / Delete / 可打印字符 →
> `editing.start` intent 语义）；宿主编辑器 excel/solid-excel/src-vnext/grid/SpreadsheetGrid.tsx
> （editor onKeyDown 的 Enter/Tab/Escape、onBlur 提交、`clearOnStart` 覆写 vs 保留）。
> 存量 spec 行数超限登记：无（vnext-direct-edit-real-backend.spec.ts 83 行）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| ED-01 | 双击进入编辑并保留原值 | dblclick B4 | 输入框预填 `10`，canonical 状态 mode=edit | ✅ 存量 | vnext-direct-edit-real-backend #"vNext direct cell editing real-backend evidence" |
| ED-02 | Enter 提交并下移一格（Excel 语义） | 编辑 B4 填 21 + Enter | B4=21、选区落 B5、mode=ready | ✅ 存量 | vnext-direct-edit-real-backend #"vNext direct cell editing real-backend evidence" |
| ED-03 | Escape 放弃草稿保留原值与选中 | 编辑 C4 填脏值 + Escape | C4 仍 `source`、mode=ready | ✅ 存量 | vnext-direct-edit-real-backend #"vNext direct cell editing real-backend evidence" |
| ED-04 | 提交值经真实后端回读全 UI 表面 | 重选 B4 | name-box/formula-bar/status-bar 一致 | ✅ 存量 | vnext-direct-edit-real-backend #"vNext direct cell editing real-backend evidence" |
| ED-05 | 直接键入覆写（typed char 清空进入编辑） | 选中 B4 按 `5` | 输入框只含 `5`（非 `105`），Enter 后 B4=5 | 🆕 本轮 | editing-session-keys.spec.ts |
| ED-06 | F2 进入编辑保留全量原值 | 选中 C4 按 F2 | 输入框预填 `source`；Escape 后原值不变 | 🆕 本轮 | editing-session-keys.spec.ts |
| ED-07 | blur 提交草稿 | 编辑 B4 填 77 后点 D6 | 输入框卸载、B4=77 | 🆕 本轮 | editing-session-keys.spec.ts |
| ED-08 | Tab 提交并右移 | 编辑 B4 填 33 + Tab | B4=33、选区落 C4 | 🆕 本轮 | editing-session-keys.spec.ts |
| ED-09 | Shift+Enter 提交并上移 | 编辑 B4 填 8 + Shift+Enter | B4=8、选区落 B3 | 🆕 本轮 | editing-session-keys.spec.ts |
| ED-10 | Backspace 清空进入编辑 / Delete 直接清值 | 选中 C4 按 Backspace；选中 B4 按 Delete | 空草稿输入框开启并可提交新值；B4 显示清空 | 🆕 本轮 | editing-session-keys.spec.ts |
| ED-11 | 只读/锁定态编辑拦截 | 保护开启后尝试编辑 | 拦截 toast、值不变 | ⏳ P2 延后 | — 属 protection/ 文件夹职责（mutation-gateway 锁定门已有 vnext-protection-real-backend 覆盖），本文件夹不重复 |
| ED-12 | IME 组合输入不触发 intent（isComposing） | 中文输入法组合期按键 | 组合期不误提交/误覆写 | ⏳ P2 延后 | — Playwright 对 composition 事件仿真能力有限，需专项调研 CDP Input.imeSetComposition 后再立用例 |
