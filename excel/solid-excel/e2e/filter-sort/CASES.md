# filter-sort — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/filter-sort/ + src-vnext/filter-sort/
> 存量 spec 行数超限登记：vnext-sort-real-backend.spec.ts 320 行（历史文件，只登记不拆）

后端口径：筛选谓词与物理排序自 E5/#24 起均为引擎所有 —— WASM worker 全量支持，
TS worker fail-closed（`engineHiddenState:false` 撤筛选、`sortRange:false` 撤排序）。
带「WASM」标注的场景仅在 wasm project 跑，TS 侧由 fail-closed 场景（FS-09/FS-16）覆盖。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| FS-01 | 筛选按钮可见/本地化/条件可用（静态 demo） | Wave5→选列→查按钮 | tooltip/aria 非裸 key；equals 规则生效后 chevron 出现 | ✅ 存量 | toolbar-filter-sort #"toolbar-btn-filter is visible, localized, and conditionally opens filter dropdown" |
| FS-02 | 值列表+条件筛选应用与清除（静态 demo） | 取消勾选值→OK→清除→contains 规则 | 隐藏行 unmount 不补位；清除后恢复 | ✅ 存量 | toolbar-filter-sort #"filter dropdown applies value-list and condition filters, then clears them" |
| FS-03 | 排序按钮可见并打开下拉 | Wave5→选中单元格→点按钮 | 下拉可见、label 本地化 | ✅ 存量 | toolbar-filter-sort #"toolbar-btn-sort is visible, labeled, and opens dropdown" |
| FS-04 | 升/降序物理重排（静态 demo，Total 行参与） | 选列→sort asc/desc→换列再排 | 行序物理变化；降序 Total 顶置（物理 vs 显示位错的判别器） | ✅ 存量 | toolbar-filter-sort #"sort-asc / sort-desc actions close dropdown and reorder visible rows" |
| FS-05 | 排序下拉 Escape/外点关闭 | 开下拉→Esc；再开→点外部 | 两种路径都收起 | ✅ 存量 | toolbar-filter-sort #"sort dropdown closes via Escape and outside click" |
| FS-06 | equals 规则隐藏不匹配行，清除恢复（WASM） | 应用 equals→清除 | 幸存行保持原行号、行号跳变、隐藏行 unmount | ✅ 存量 | vnext-filter-sort-real-backend #"equals rule hides non-matching rows and clearing the rule restores them" |
| FS-07 | 筛选态编辑可见行 → 写的就是看到的行 | 筛选后 dblclick 编辑 D4 | 值落在 D4；清除筛选后仍在 D4，D2 未被误写 | ✅ 存量 | vnext-filter-sort-real-backend #"an edit under an active filter writes the row the user sees" |
| FS-08 | 手动隐藏集与筛选隐藏集互不干扰 | 手动藏行→加筛选→清筛选 | 清筛选不放出手动隐藏行 | ✅ 存量 | vnext-filter-sort-real-backend #"a manually hidden row does not change what it refers to when a filter changes" |
| FS-09 | TS worker 筛选 fail-closed | ts project 打开 worker demo | filter 按钮 disabled | ✅ 存量 | vnext-filter-sort-real-backend #"the filter entry is withheld because the predicate is engine-owned" |
| FS-10 | Reapply 无筛选禁用/有筛选启用（WASM） | 开 Data 菜单前后对比 | 菜单项 disabled→enabled | ✅ 存量 | vnext-reapply-filter-real-backend #"Reapply is disabled until a filter exists, then enabled" |
| FS-11 | 编辑不实时重算，Reapply 后才隐藏（WASM） | 破坏匹配→断言快照未动→Reapply | 反例先行：编辑后行仍在；Reapply 后消失 | ✅ 存量 | vnext-reapply-filter-real-backend #"an edit does not move the row until Reapply, which then hides it" |
| FS-12 | Ctrl+Alt+L 重算且幸存行保持原行号（WASM） | 快捷键触发 | 行号跳变保持，无补位 | ✅ 存量 | vnext-reapply-filter-real-backend #"Ctrl+Alt+L reapplies and leaves still-matching rows at their own index" |
| FS-13 | WASM 物理排序 + range.sort 历史 + undo/redo | 种乱序列→toolbar sort→undo→redo | 整行移动；恰一条 range.sort；undo 恢复数据并治愈跨表链 | ✅ 存量 | vnext-sort-real-backend #"WASM worker physically reorders the data region, records range.sort, and undo/redo move real data" |
| FS-14 | 筛选态工具栏排序：可见行互排、隐藏行原位（WASM） | 筛掉中间行→sort asc→清筛选 | 可见行只落在原可见槽位；隐藏行被跳过而非写穿（excludedRows） | ✅ 存量 | vnext-sort-real-backend #"WASM worker: a filter-active toolbar sort reorders the visible rows and leaves the filtered row in place" |
| FS-15 | 筛选下拉内排序入口（WASM） | filter dropdown → sort asc | 菜单关闭 + 物理重排 + 一条 range.sort | ✅ 存量 | vnext-sort-real-backend #"WASM worker: the filter dropdown sort dispatches a physical engine sort and closes the menu" |
| FS-16 | TS worker 排序入口全撤、数据不动 | ts project 逐入口探测 | toolbar/menu/dropdown 排序入口全部不存在；数据与历史无排序痕迹 | ✅ 存量 | vnext-sort-real-backend #"TS worker fail-closes: every sort entrypoint is withheld and no data moves" |
| FS-17 | 筛选活跃时插入行：两隐藏集各自跟随位移（WASM） | #27 S5a 原始 repro 四步 | 行头集合 = [0,1,4,5]；SUBTOTAL 探针值不变；undo 复原 | ✅ 存量 | vnext-filter-structural-shift-real-backend #"inserting a row above an active filter keeps both hidden sets on their own rows" |
| FS-18 | 删除可见行：筛选隐藏索引跟随位移（WASM） | 筛掉 10→删行 0 | 隐藏索引 1→0 跟移，不吞新 20、不放出 10 | ✅ 存量 | vnext-filter-structural-shift-real-backend #"deleting a visible row above a filter-hidden one carries the hidden index with it" |
| FS-19 | 多行粘贴跨过筛选隐藏行：按物理行落点写穿（WASM） | 复制 3 行→筛掉中间行→锚在可见行粘贴→清筛选 | 实际产品行为：隐藏物理行被写入（clipboard 层无隐藏行感知）；清筛选后粘贴值浮现、隐藏行原有数据未误伤 | 🆕 本轮 | filter-paste-visibility.spec.ts #"a multi-row paste anchored on a visible row writes through the filter-hidden row" |
| FS-20 | 筛选态单元格粘贴到可见行：清筛选后值保持 | 单元格复制→筛选→粘贴到可见行→清筛选 | 值留在所见行；隐藏行为空未被写 | 🆕 本轮 | filter-paste-visibility.spec.ts #"a single-cell paste onto a visible row keeps its value after the filter clears" |
| FS-21 | 排序稳定性：同键行保持相对顺序（WASM） | 种重复键 2/1/2/1 + 见证列→asc→重复 asc→desc | 同键行按源顺序排列（asc 与 desc 均稳定）；已序重排为 no-op、不产生新 range.sort 历史（最终恰 2 条） | 🆕 本轮 | sort-stability.spec.ts #"equal-key rows keep source order under asc and desc, and a re-sort moves nothing" |
| FS-22 | 筛选态复制：只复制可见行 vs 连隐藏行一起复制 | — | Excel 只复制可见行；本产品 clipboard 层无隐藏行感知，语义未锁定。与 clipboard/ 文件夹共界，待产品定标后补 | ⏳ P2 延后 | — |
| FS-23 | 值列表超 MAX_FILTER_LIST_VALUES (10000) 截断 | — | UI 种万级 distinct 值成本过高；截断逻辑已有单测（filter-sort.test.ts） | ⏳ P2 延后 | — |
