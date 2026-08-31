# formula-bar — e2e cases

> 功能源码：excel/solid-excel/src 的 formula-bar 组件与 editing 会话
> （IME 组合期的命令边界：composing 时 Enter/Escape 不得提交/取消编辑会话）。
> 单元格编辑器侧的 IME 语义在 editing/（grid-cell-editor-ime.spec.ts），本目录只覆盖公式栏输入侧。
> 存量 spec 行数超限登记：无（94 行）

| ID    | 场景                                     | 步骤概要                                                        | 关键断言                                                                       | 状态    | spec                    |
| ----- | ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- | ----------------------- |
| FB-01 | IME 组合期 Enter/Escape 留在浏览器不提交 | 公式栏输入 ime-draft 进入组合态，组合期派发 Enter/Escape，结束组合后再 Enter | 组合期两键均不被 preventDefault、草稿与焦点不变；组合结束后 Enter 提交 H2=ime-draft | ✅ 存量 | formula-bar-ime.spec.ts |
