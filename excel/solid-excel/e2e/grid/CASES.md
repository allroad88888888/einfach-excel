# grid — e2e cases

> 功能源码：excel/solid-excel/src/grid/SpreadsheetGrid.tsx（fill-handle 指针生命周期、
> Tab/Shift+Tab 键盘边界、aria-activedescendant）+ excel/spreadsheet-ui-core 的选区/填充 atoms。
> 本目录只放"网格自身交互"的用例；编辑会话语义在 editing/，选区语义在 selection/。
> 存量 spec 行数超限登记：无（两个 spec 均 <160 行）

| ID    | 场景                                        | 步骤概要                                                  | 关键断言                                                             | 状态    | spec                                |
| ----- | ------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- | ------- | ----------------------------------- |
| GR-01 | fill-handle 拖拽提交复制值                  | 从 B3 的 fill-handle 拖到 B4 后释放                       | B3/B4 均为 120，预览 class 清除                                       | ✅ 存量 | grid-fill-pointer-lifecycle.spec.ts |
| GR-02 | pointercancel 清除填充预览且不提交          | 拖拽中触发 pointercancel                                  | 预览 class 消失，B3=80、B4=200 保持原值                               | ✅ 存量 | grid-fill-pointer-lifecycle.spec.ts |
| GR-03 | 非发起指针无法预览/提交填充                 | 第二个 pointerId 在拖拽中移动与释放                       | 无预览 class，值不变                                                  | ✅ 存量 | grid-fill-pointer-lifecycle.spec.ts |
| GR-04 | 导航附属控件不进 Tab 序列                   | Wave5 页面枚举 navigation affordances                     | 存在但 tabindex 均不参与顺序焦点                                      | ✅ 存量 | grid-tab-boundary.spec.ts           |
| GR-05 | 富文本超链接是独立键盘焦点目标              | vnext smoke 页面 Tab 到 cell 内链接                       | href 正确且可获焦                                                     | ✅ 存量 | grid-tab-boundary.spec.ts           |
| GR-06 | 网格内 Tab/Shift+Tab 沿选中格移动           | Wave5 页面选格后 Tab / Shift+Tab                          | data-active 迁移且 aria-activedescendant 同步                         | ✅ 存量 | grid-tab-boundary.spec.ts           |
| GR-07 | A1 处 Shift+Tab 溢出到前一个原生控件        | 选中 A1 按 Shift+Tab                                      | 焦点落 formula 输入框（网格不吞越界 Tab）                             | ✅ 存量 | grid-tab-boundary.spec.ts           |
| GR-08 | 末格 Tab 溢出到后一个原生控件               | 选中 P50 按 Tab                                           | 焦点落 sheet tab（网格不吞越界 Tab）                                  | ✅ 存量 | grid-tab-boundary.spec.ts           |
