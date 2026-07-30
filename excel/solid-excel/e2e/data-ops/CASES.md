# data-ops（分列 + 去重）— e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/remove-duplicates/、text-to-columns/ +
> src-vnext/remove-duplicates/、text-to-columns/
> 存量 spec 行数超限登记：remove-duplicates.spec.ts 396 行、text-to-columns.spec.ts 312 行
> （历史文件，只登记不拆）

Wave 5 静态 demo 是两条对话框流的主战场（两个 project 都跑）；worker demo 上的
real-backend spec 验证真实引擎 ACK 与 TS worker 的能力隐藏。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| DO-01 | 全行重复检出并删除（Data 菜单入口） | 种 6 行含 2 重复→菜单开→确认 | 预览 2/5；唯一行上移、尾行清空 | ✅ 存量 | remove-duplicates.spec.ts #"opening the dialog, confirming removes the duplicate rows" |
| DO-02 | 取消勾选区分列 → 预览计数更新 | 全选 0 重复→去掉 G 列→1 重复 | 确认按钮 disabled↔enabled 联动 | ✅ 存量 | remove-duplicates.spec.ts #"deselecting a differentiating column updates the preview count" |
| DO-03 | caseInsensitive 跨大小写判重 | Foo/foo/FOO 切换比较模式 | exact 0 重复；caseInsensitive 2/3 | ✅ 存量 | remove-duplicates.spec.ts #"caseInsensitive comparison finds duplicates across case" |
| DO-04 | 无重复空态文案 + 确认禁用 | 全唯一行开对话框 | "No duplicates found" + disabled | ✅ 存量 | remove-duplicates.spec.ts #"noDuplicates preview surfaces the friendly empty-state message" |
| DO-05 | 全不选列 → noKeyColumns 提示 + 禁用 | deselect-all | "Select at least one column" + disabled | ✅ 存量 | remove-duplicates.spec.ts #"deselect-all surfaces the noKeyColumns message + disables Remove" |
| DO-06 | 会话中切 sheet → read-stale 拒绝且不删行 | 开对话框→切 sheet→确认 | data-status=read-stale；两个 sheet 数据均未动 | ✅ 存量 | remove-duplicates.spec.ts #"sheet drift makes confirm read-stale without removing rows" |
| DO-07 | 撤销恢复被删行 | 删 2 重复→Ctrl+Z | 5 行原序全回 | ✅ 存量 | remove-duplicates.spec.ts #"undo restores rows deleted by Remove Duplicates" |
| DO-08 | trim 比较视首尾空白相等 | ' foo' vs 'foo ' 切 trim | exact 0 重复；trim 1/3 | ✅ 存量 | remove-duplicates.spec.ts #"trim comparison treats leading/trailing whitespace as equal" |
| DO-09 | 逗号分列 3 步向导端到端 | 选两行→向导→Finish | G/H/I 两行改写 | ✅ 存量 | text-to-columns.spec.ts #"selecting a column, splitting on comma, finishing rewrites the cells" |
| DO-10 | 文本限定符语义（P1 #1） | `foo"bar",x` 带 `"` 限定符 | 裸引号不开 quote run → 两个 token | ✅ 存量 | text-to-columns.spec.ts #"qualifier groups inner-quote contents into one token, not three" |
| DO-11 | 双引号转义 | `"foo""bar",x` | `""` → 一个字面引号 | ✅ 存量 | text-to-columns.spec.ts #"a quoted token containing \"\" emits one literal inner quote" |
| DO-12 | Step3 Date 选项禁用 + tooltip（P2 #4） | 到 step-3 查 option | disabled 属性 + i18n title | ✅ 存量 | text-to-columns.spec.ts #"Step 3 Date <option> is disabled and carries the i18n tooltip" |
| DO-13 | 空分隔符集 Next 禁用（P3 #6） | 取消全部分隔符 | Next disabled + 提示文案 | ✅ 存量 | text-to-columns.spec.ts #"unchecking every delimiter disables Next and surfaces the hint" |
| DO-14 | 固定宽度断点分列 | breakpoints 3,7 | 预览 3 token + 落表 abc/DEFG/hijkl | ✅ 存量 | text-to-columns.spec.ts #"fixed-width with breakpoints 3,7 splits at those character offsets" |
| DO-15 | 预览 500 token 截断（P2 #5 回归） | 600 token 行 | ≤500 cell、末尾 `…`、向导不卡死 | ✅ 存量 | text-to-columns.spec.ts #"a 600-token row clamps at 500 tokens with a `…` truncation marker" |
| DO-16 | 真实后端分列 + 选区/状态栏保持 | worker demo 全向导 | data-step/lifecycle 逐步断言；A4/B4 落值；canonical 选区不漂移 | ✅ 存量 | vnext-text-to-columns-real-backend.spec.ts #"splits one selected text column and preserves canonical selection/status" |
| DO-17 | WASM 真实去重（菜单 + exact ACK） | worker demo 种重复→菜单→确认 | 重复行删除、尾行清空 | ✅ 存量 | vnext-worker-remove-duplicates-real-backend.spec.ts #"WASM removes duplicate rows through the visible Data menu and exact ACK bridge" |
| DO-18 | TS worker 不暴露去重入口 | ts project 开 Data 菜单 | 菜单项与对话框均不存在（deleteRows no-op → 能力隐藏） | ✅ 存量 | vnext-worker-remove-duplicates-real-backend.spec.ts #"TS worker does not advertise Remove Duplicates while deleteRows is a no-op" |
| DO-19 | 显示值判等：数字 1 与 `="1"` 文本同显示 → 判重 | 种 1 / ="1" / 1.0 → 开对话框→确认 | ROADMAP 锁定语义：预览 "Will remove 1 of 3 rows"；数字 1 幸存（首现胜） | 🆕 本轮 | remove-duplicates-display-value.spec.ts #"number 1 and text =\"1\" share a display so they ARE duplicates" |
| DO-20 | 显示值判等反向：1 与 1.0 数值等、显示异 → 不判重 | 种 1 / 1.0 → 开对话框 | "No duplicates found" + 确认禁用；数据未动 | 🆕 本轮 | remove-duplicates-display-value.spec.ts #"1 and 1.0 are numerically equal but display-distinct so they are NOT duplicates" |
| DO-21 | 逗号+空格组合、不折叠 → 空 token 保留 | `a, b,c` 勾 comma+space | 预览与落表均含空 token（`a`/``/`b`/`c`） | 🆕 本轮 | text-to-columns-delimiters.spec.ts #"consecutive delimiters OFF keeps the empty token between comma and space" |
| DO-22 | 逗号+空格 + treatConsecutiveAsOne 折叠连续分隔符 | `a, b,  c` 勾 consecutive | 恰 3 token；无第 4 列输出 | 🆕 本轮 | text-to-columns-delimiters.spec.ts #"treatConsecutiveAsOne collapses mixed comma+space runs into single boundaries" |
| DO-23 | 目标区已有数据：静默覆盖（无确认流）+ 单步 undo 双还原 | H2 预置数据→分列 G2→Finish→Ctrl+Z | 实际产品行为：Finish 直接关窗无确认；H2 被覆盖；一次 undo 同时还原源列与被覆盖邻列 | 🆕 本轮 | text-to-columns-overwrite.spec.ts #"Finish overwrites the neighbor silently and one undo restores source and neighbor" |
| DO-24 | 去重跳过 filter-hidden 行（hiddenRows 输入） | — | 需 WASM 筛选 + 去重对话框组合；语义已由单测锁定（remove-duplicates.test.ts "Filter-hidden rows never reach duplicateRows"），e2e 组合流后补 | ⏳ P2 延后 | — |
| DO-25 | 超大范围去重的 UI 级警告 | — | README 声明"dialog should still warn before scanning very large ranges"，该 UI 尚未实现，无可断言产品行为 | ⏳ P2 延后 | — |
| DO-26 | 分列 Date 格式真实解析 | — | 产品明确 deferred（option disabled，DO-12 已锁禁用态），待 parseDate port | ⏳ P2 延后 | — |
