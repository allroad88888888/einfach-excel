# Headless mounting contract

## Purpose

本文只定义宿主挂载期的最小职责。

这里的 headless 宿主是在现有 UI-core、`SpreadsheetBackend` 与 DOM
之间自行承担挂载生命周期的调用方。本文是当前源码事实的契约说明，不是
新包、公共类型或实现方案。

一个挂载会话至少绑定以下对象：

- 一个 `Store`；
- 一个 `SpreadsheetBackend`；
- 一个当前 `sheetId`；以及
- 一个可在会话内取得的滚动 DOM 根节点。

会话从这些对象可用时开始，在宿主卸载该表面时结束。会话之间不得复用
订阅取消函数、DOM 引用、滚动锚点或指针交互清理函数。

## Source facts used by this contract

| Source                                                                                               | Confirmed fact                                                                                                                    | Consequence here                                               |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`backend/types.ts`](../excel/spreadsheet-ui-core/src/backend/types.ts)                              | `readVisibleProjection`、`readRangeProjection` 与 `setCellInput` 是后端必需端口；其他命令端口可缺席。                             | 宿主只调用存在的匹配端口，不假设一个通用 `dispatch` 后端函数。 |
| [`projection/index.ts`](../excel/spreadsheet-ui-core/src/projection/index.ts)                        | `projectionSnapshotAtom` 是只读消费面；请求和结果经 `beginProjectionAtom`、`resolveProjectionAtom`、`rejectProjectionAtom` 流转。 | 宿主经命令推进投影状态，不能直接写显示快照。                   |
| [`projection-refresh.ts`](../excel/solid-excel/src/provider/projection-refresh.ts)             | 一个已开始的 visible transport 负责排空 Store-local 的最新请求队列。                                                              | 排队请求不另起读取；现有 transport 接收后继请求。              |
| [`grid-lifecycle.ts`](../excel/solid-excel/src/grid/grid-lifecycle.ts)                         | 当前网格集中保存 `store.sub`、内容变更取消函数、`ResizeObserver` 与指针取消工作。                                                 | headless 宿主必须对等地保存并在卸载时释放这些资源。            |
| [`grid-projection-controller.ts`](../excel/solid-excel/src/grid/grid-projection-controller.ts) | 可见窗口从已知 viewport 指标取得；DOM 尺寸只在挂载或 `ResizeObserver` 回调读取。                                                  | 滚动热路径不强制读取 `clientWidth` 或 `clientHeight`。         |
| [`grid-dom-adapter.ts`](../excel/solid-excel/src/grid/grid-dom-adapter.ts)                     | DOM 适配器只保存元素引用、滚动锚点与指针监听清理；产品状态留在 UI-core atoms。                                                    | DOM 资源属于挂载宿主，产品状态不属于 DOM 适配器。              |

## Minimum contract

### 1. Own one mount session

宿主必须为每次挂载建立一个明确的资源所有者，并且只在该会话存活时注册
命令式订阅或 DOM 工作。渲染本身应读取 UI-core 的只读 atoms；订阅只用于
触发命令式刷新、重算或 DOM 同步。

宿主必须保存下列每一个清理句柄：

- 所有 `store.sub` 的返回取消函数；
- `backend.subscribeContentChanges` 存在时的返回取消函数；
- 注册给滚动根节点的事件监听器；
- `ResizeObserver`；以及
- 拖选、调整尺寸、填充等进行中的指针操作的取消函数。

卸载时，宿主必须停止 observer、注销监听器、逐一调用取消函数，并取消
所有进行中的指针操作。随后必须把 UI-core 的指针状态复位，而不是让下一次
挂载继承旧交互。

`subscribeContentChanges` 是无 payload 的粗粒度通知，允许出现多余通知。
如果后端提供该端口，通知只能经下面的可见投影流程请求一次刷新。若后端
没有该端口，宿主不得把它当作必需能力。

卸载并不推定已经发出的后端读取可被取消。投影命令自身负责拒绝过期或不
匹配的完成结果；清理的责任是阻止已解除的订阅继续发起工作或继续操作 DOM。

### 2. Read projection through its lifecycle

宿主显示单元格时必须读取 `projectionSnapshotAtom` 的结果，而不能把后端
返回的 `DisplayCell[]` 另存为显示真相。投影只是有界显示数据，不是工作簿
事实、公式缓存或全表快照。

可见窗口读取遵循以下流程：

1. 从当前 sheet、滚动位置、视口尺寸与布局指标得出一个非空窗口。
2. 通过 `beginProjectionAtom` 创建 `kind: 'visible-window'` 请求。
3. 只有结果为 `started` 时，才调用 `backend.readVisibleProjection`。
4. 将成功结果交给 `resolveProjectionAtom`，将异常交给
   `rejectProjectionAtom`。
5. `resolve` 或 `reject` 返回后继请求时，当前 transport 必须继续读取该
   后继请求，直至没有后继请求。

visible lane 同时只允许一个活动 transport。`queued` 表示该请求已由活动
transport 接管，宿主不得为它启动第二个 `readVisibleProjection`。可见窗口
变化、内容变更与会改变渲染几何的状态变化，都必须重走这个流程。

显式范围读取使用独立的 `kind: 'range'` lane。只有 `started` 的范围请求可
调用 `backend.readRangeProjection`；成功或失败同样必须经 resolve/reject
命令结算。此结果交还给发起它的复制或填充类命令，不能替换可见显示快照。

宿主不得绕过这些命令直接写入 `projectionSnapshotAtom`，也不得为处理过期
响应而自行替换显示 cells。请求与结果的 kind、sheet、request id、矩形和
显式 revision 相关性由投影边界验证。

### 3. Dispatch commands through UI-core state

宿主把键盘、指针、菜单或编辑器事件翻译为相应的 UI-core 命令，再由该命令
调用对应的后端端口。选择、编辑会话、命令失败、历史记录与投影刷新必须留在
各自的 UI-core 命令生命周期中，不能由 DOM 层维护一份平行产品状态。

对写命令，宿主必须遵守下列规则：

- 只使用后端实际提供的具体端口；可选端口缺席表示该操作不可调用。
- 写入端口 resolve 的确认必须代表引擎已真正应用写入。不能写入时必须 reject，
  不能伪造成功确认。
- 命令完成后，按该命令的既有流程记录确认结果并请求可见投影刷新；失败交给
  对应的 UI-core 失败生命周期。
- 不直接修改 `DisplayCell`、投影快照或选择快照来预测写入结果。

本契约没有定义一个泛化的 `dispatch(command)` 形状。现有后端是按读取和
具体命令端口建模的，headless 宿主必须保持这种边界。

### 4. Own DOM measurement separately from backend metadata

DOM 测量属于挂载宿主。挂载期间，宿主必须持有滚动根节点，维护行列滚动锚点，
并把原生 `scrollTop`、`scrollLeft` 与 viewport 指标同步。需要时，宿主可以
将逻辑滚动位置重新落到元素的物理滚动位置；这个写入同样属于 DOM 所有者。

尺寸变化时，宿主从滚动根节点读取 `clientWidth` 和 `clientHeight`，扣除当前
表头占用后更新 viewport 指标。读取应发生在挂载初始化或 `ResizeObserver`
回调，而不应被置入每个滚动事件的热路径。observer 的创建、观察目标与断开
均由同一挂载会话拥有。

`readViewportSizeProjection` 是另一类可选后端读取：它返回当前窗口的行高和
列宽元数据，不读取浏览器尺寸。若端口存在，宿主通过
`hydrateViewportSizeProjectionAtom` 请求并接受其结果；它不能替代 DOM 尺寸
测量。端口缺席时该 hydration 结果为 unsupported，宿主不得从中推断 DOM
能力。

当前 DOM 适配器的最小临时资源是 grid 根节点、scroll 根节点、行锚点、列锚点
与三类指针取消函数。它们只在挂载会话内有效；产品状态继续由 UI-core atoms
拥有。本文件不把这组资源声明为新的 TypeScript 接口。

## Mount and teardown sequence

1. 创建会话资源，取得 store、backend、sheet 与 DOM 根节点。
2. 初始化 viewport、选择边界和必要的视图 metadata；注册订阅、滚动监听与
   可用的 `ResizeObserver`。
3. 读取初始 DOM 尺寸，计算可见窗口，并按投影生命周期启动首次 visible 读取。
4. 运行期间，让滚动、尺寸、内容变更和成功命令通过各自的命令流更新状态；
   只在窗口或数据需要刷新时请求投影。
5. 卸载时，按“Own one mount session”释放所有资源，取消指针交互，并停止
   后续 DOM 工作。

## Deliberate non-decisions

本文不分配共享层的归属，不创建包或代码，不定义框架支持范围，也不陈述安装、
兼容性、发布、服务等级或性能承诺。DOM 测量接口的进一步抽象不在本文范围内。
