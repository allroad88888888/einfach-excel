# ADR 0012：UI-core 下沉目标

- 状态：accepted
- 日期：2026-08-13
- 相关：[AD-300：框架适配层](../adoption-issues/AD-300-framework-adapters.md)、[AD-312：Grid
  框架可移植性边界](../FRAMEWORK_GRID_PORTABILITY_BOUNDARIES.md)、[AD-313：编辑框架可移植性边界](../FRAMEWORK_EDITING_PORTABILITY_BOUNDARIES.md)、[AD-313：选区框架可移植性边界](../FRAMEWORK_SELECTION_PORTABILITY_BOUNDARIES.md)、[AD-314：非 Grid 交互的框架可移植性边界](../FRAMEWORK_INTERACTION_PORTABILITY_BOUNDARIES.md)、[AD-320：Headless mounting contract](../HEADLESS_MOUNTING_CONTRACT.md)

## 背景

AD-312、AD-313 与 AD-314 已按当前实现识别出不必依赖 Solid、JSX 或浏览器对象的
候选，但有些候选表达工作簿交互的事实与命令规则，有些则表达渲染表面的几何和样式。
若只以“当前没有 DOM import”为准把它们放入同一层，UI-core 会逐步接住元素、测量或
挂载责任，反而破坏其可供不同宿主复用的边界。

## 决策

DOM-free 候选按**责任**而非现有目录、是否有 `solid-js` import 或未来框架数量，落入
下列两个目标层。

### UI-core：交互事实、命令和纯领域规则

`@einfach/spreadsheet-ui-core` 是工作表 UI 的无头状态与命令层。只要一个候选的输入和
输出都是工作簿/UI 事实、坐标、范围、文本、显式数据契约或既有 Atom 命令，并且它不
表达渲染表面的样式、元素或资源所有权，它的目标就是 UI-core。这包括：

- AD-312 的数值坐标、范围、滚动锚定计划和无渲染器语义的常量/格式规则；
- AD-313 的编辑、选区、指针、公式引用、键盘意图、投影源文本和提交命令编排；以及
- AD-314 的键盘/菜单/工具栏命令决策、反馈数据转换和不依赖渲染节点的剪贴板文本转换。

UI-core 必须持续**完全 DOM-free**：不得导入或公开 DOM runtime API、DOM 类型、浏览器
事件类型、`HTMLElement`、`DOMRect`、`CSSStyleDeclaration`、observer、焦点、滚动元素或
任何挂载/清理句柄；也不得以回调、reader 或不透明对象的形式转移这些责任。没有直接
DOM import 不是准入理由，输入、输出和副作用都必须满足这条约束。

### 共享展示/交互层：跨渲染器的表面纯计算

DOM-free、但职责是把已给出的 UI 事实变成渲染器可消费的布局、覆盖层几何、结构化样式
值或展示模型的候选，目标是一个独立的共享展示/交互层，而不是 UI-core。AD-312 的冻结
布局、合并布局、覆盖层几何和单元格格式映射，以及 AD-314 的锚定菜单几何和与展示输入
相关的契约，属于这一类。

此 ADR 只命名这一层及其边界，不创建包、目录、导出面或 API。该层只能接收显式的值或
框架中立 reader，并返回数据；它不能替适配器取得元素、订阅组件、注册原生事件、读取
浏览器环境或拥有清理资源。若一个候选同时包含纯计算和这些责任，只有纯计算可按本决策
拆出；其余部分继续由当前或未来框架适配器拥有。

## 后果

后续抽取先以这两个准入问题分类：它是否是 UI-core 的无头事实/命令规则；若否，它是否
只是可跨渲染器复用的表面纯计算。两个答案都是否时，代码不因“可移植”标签而下沉。
这使 React、Vue 或其它宿主可以复用业务语义和展示计算，同时各自保留事件、ref、渲染
与资源释放的责任。

AD-320 已规定每次挂载会话必须拥有订阅、滚动根、observer 和指针清理；这些资源不会因
本决策进入 UI-core 或共享展示/交互层。DOM 测量所需的接口形状、行列尺寸和 viewport
抽象仍由 AD-321 决定，不能从“显式值输入”推导出新的测量 API。

## 不在范围

- 移动现有代码、改变包依赖或创建共享包；
- React、Vue 或其它框架的组件、hook、Provider、订阅或渲染 API；
- DOM 事件、元素 ref、焦点、pointer capture、滚动写入、`ResizeObserver`、挂载或卸载；
- AD-321 的 DOM 测量接口；
- 将 AD-312、AD-313 或 AD-314 中当前保留的组合器、控制器或生命周期会话整体下沉。

后续实现必须逐项证明抽出的部分符合本 ADR 的目标层；若要改变 UI-core 的 DOM-free
约束或共享层的资源边界，须以新的 ADR 裁决。
