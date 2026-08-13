# Framework-side DOM measurement adapter contract

## Purpose

本文定义框架侧 DOM measurement adapter 在一个已存在的 grid 挂载会话中应
交付的最小测量契约。它只把当前浏览器表面的测量结果交给既有的 viewport、
滚动锚定和 auto-fit 调用流程；不把浏览器测量伪装成 backend metadata。

这里的 adapter 是该挂载会话的短生命周期协作者。它持有当前 grid 与 scroll
DOM 引用，读取浏览器值，并在会话结束时释放自己的 DOM 工作；产品状态仍由
UI-core atoms 与既有命令生命周期拥有。

## Source grounding

| Source                                                                                                                | Confirmed fact                                                                                        | Contract consequence                                      |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [HEADLESS_MOUNTING_CONTRACT §4](HEADLESS_MOUNTING_CONTRACT.md#4-own-dom-measurement-separately-from-backend-metadata) | 挂载宿主拥有 scroll 根节点、行列锚点、原生滚动位置和浏览器 viewport 尺寸。                            | adapter 的 DOM 输入只在一个挂载会话内有效。               |
| [`grid-lifecycle.ts`](../excel/solid-excel/src-vnext/grid/grid-lifecycle.ts)                                          | 挂载时同步尺寸并创建、观察 `ResizeObserver`；清理时调用 `disconnect()`。                              | 创建、观察和断开 observer 必须由同一会话负责。            |
| [`grid-projection-controller.ts`](../excel/solid-excel/src-vnext/grid/grid-projection-controller.ts)                  | `clientWidth` / `clientHeight` 在挂载或 observer 回调读取；滚动路径消费已有 viewport 指标。           | 尺寸读取不可放入每个 scroll event 的热路径。              |
| [`grid-auto-fit.ts`](../excel/solid-excel/src-vnext/grid/grid-auto-fit.ts)                                            | auto-fit 从当前元素的计算样式和临时 DOM probe 的矩形读取尺寸，并立即移除 probe。                      | auto-fit 测量使用当前 window/document，不能留下临时节点。 |
| [`grid-auto-fit-controller.ts`](../excel/solid-excel/src-vnext/grid/grid-auto-fit-controller.ts)                      | 当前 grid 根节点限定 header 与 cell 候选范围；结果先进入既有 viewport size 命令，再按可选端口持久化。 | adapter 只提供候选的像素测量，不拥有命令状态或持久化。    |

## Minimum adapter surface

本契约描述最小语义，不声明新的 TypeScript 接口。实现可以按框架的 ref 与
生命周期形式承载这些输入和输出，但不得扩大它们的所有权。

| Concern          | Required inputs                                                                                                                         | Required output                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Viewport         | 当前 scroll 根节点；其 `clientWidth`、`clientHeight`；当前 heading 占用；上一次有效 viewport 指标。                                     | 扣除 heading 后的非负有效 `viewportWidth` 与 `viewportHeight`，或在本次读数不可用时保留上一次有效值。 |
| Scroll anchoring | 当前 scroll 根节点；原生 `scrollTop`、`scrollLeft`；当前 row / column anchor；调用方给出的逻辑目标或已计算的落点。                      | 当前逻辑滚动位置，或一组先更新 anchor、再写回物理滚动位置的同步结果。                                 |
| Auto-fit         | 当前 grid 根节点；目标 row 或 column；该根节点内对应 header / cell 候选元素；当前浏览器的样式与布局测量能力；调用方给出的默认值和边界。 | 目标轴的一个已取整且在边界内的像素值，取当前候选的最大测量值。                                        |

DOM 引用不存在、已解绑或不再属于当前会话时，adapter 必须不产生 DOM 写入。
它可以报告“本次无测量”，由既有调用方保留当前值；不得制造一个浏览器尺寸、
锚点或 auto-fit 数值。

## Call phases

### 1. Mount viewport initialization

挂载取得 scroll 根节点后，adapter 读取一次 `clientWidth` 与 `clientHeight`，
扣除当前 row / column heading 占用，并将有效 viewport 尺寸交给既有 viewport
更新命令。随后会话可依据已知 metrics 计算可见窗口并请求投影。

adapter 必须在同一会话中为该 scroll 根节点注册 `ResizeObserver`。每次 observer
回调重复上述尺寸测量和更新；它不是滚动监听器的替代品。可见窗口刷新流程只
消费更新后的 metrics，不因这份契约直接读取 backend。

`readViewportSizeProjection` 若存在，仍是行高和列宽 metadata 的可选读取，
必须经既有 hydration 命令处理。它不能提供 `clientWidth`、`clientHeight` 或
替代本节的 DOM 测量；端口缺席只表示该 metadata hydration unsupported。

### 2. Scroll anchoring

每个 scroll event，adapter 读取原生 `scrollTop` 与 `scrollLeft`，并与当前行列
anchor 合成逻辑位置。需要重锚时，调用方必须先确定新的 anchor 和对应的物理
落点；adapter 按“anchor 先落地、物理 scroll 位置后写入”的顺序同步 DOM，避免
滚动表面与 spacer 不一致。

逻辑滚动位置随后进入既有 viewport 状态更新。该状态更新可以触发既有投影
流程，但 scroll event 本身不得读取 `clientWidth` 或 `clientHeight`。从逻辑位置
反向同步 DOM 的跳转同样使用本节的 anchor 和物理落点，不创建跨会话共享锚点。

### 3. Auto-fit measurement

auto-fit 仅在用户或既有 grid 命令请求目标 row / column 时运行。adapter 在当前
grid 根节点内查找该轴的 header 与已渲染 cell 候选，读取每个候选的可见文本、
计算样式和布局矩形；不从整个工作簿或 backend 枚举内容。

为测量文本，adapter 可以在当前 `document.body` 创建不可见 probe，继承候选的
字体相关样式，读取其矩形，并在同一次测量中移除该 probe。计算结果加入相应
padding，汇总为最大值，再由调用方给出的最小值和最大值夹取、取整。

adapter 将最终 width 或 height 交给既有 viewport size 命令。命令是否写入
UI-core 状态、是否调用可选持久化端口、如何报告失败，都不属于测量 adapter
的职责。

## Teardown responsibility

挂载会话的资源所有者必须在卸载时，按下列顺序终止 DOM measurement 工作：

1. `disconnect()` 该会话创建的 `ResizeObserver`，使之后的尺寸变化不再触发读取。
2. 注销该会话注册的 scroll 监听器，使旧根节点不能再提交滚动或锚点结果。
3. 使 grid root、scroll root、row anchor 和 column anchor 对后续 adapter 调用失效；
   新挂载必须建立自己的引用和锚点。
4. 确认没有遗留 auto-fit probe；若测量不能在会话结束前完成，它必须放弃 DOM
   写入，而非操作已卸载的 root 或 document 节点。

这项清理只停止未来的 DOM 工作。它不表示后端读取或尺寸持久化请求可取消；
既有命令生命周期负责拒绝过期结果，adapter 负责不再读取或写入已解除的 DOM。

## Deliberate non-decisions

本文不选择 AD-315 的目标层，不改变任何现有 source，不把 DOM 测量登记为
backend metadata，也不把 DOM 节点或生命周期移入 UI-core。本文不承诺任何框架
支持、安装路径、兼容性或发布安排。
