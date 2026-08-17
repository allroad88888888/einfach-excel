# 给 Solid 库补上 React/Vue 适配层：从单框架到三框架的真实工序

我们的表格栈一直宣称「框架无关」：无头的 `@einfach/spreadsheet-ui-core` 管状态与命令，Solid 只是第一个渲染适配。但只有一个消费者的「框架无关」是主张，不是证据。仓库里给这项工作的 issue 组（AD-300）开篇就是这句话：「框架无关」从主张变成证据的地方。

这篇文章记录补上 React 与 Vue 适配层的真实工序。先说结论：三分之二的工作发生在写第一行 React 代码之前。

## 工序不是「写两个 wrapper」

依赖顺序被明确画成一条链：先做可移植性夯实（AD-310），然后 React（AD-330）与 Vue（AD-360）两条线并行，最后收一个三框架共享面（AD-390）。夯实必须在前——否则两条框架线各自撞一遍同样的耦合问题，还会把 Solid 的实现细节当成共享语义抄过去。

## 第一步：把可移植性边界画出来，而不是感觉出来

夯实的起点是一份逐条登记的 Solid 耦合审计（AD-311）：`src-vnext` 下每个 `solid-js` import 的耦合原因。完整扫描是 136 个直接导入声明（25 个 `.ts`、111 个 `.tsx`），其中 grid 占 3 + 14，其余 119 个属于非 grid 表面。

在这份台账之上，按机制分了三份边界文档（grid、编辑与选区、其余交互批次），每份都是同一个格式：一张「框架中立候选」表，一张「必须留在框架侧」表。以 grid 为例——

可下沉的候选：行列偏移与像素换算（`axis-geometry`）、滚动锚定计划（`scroll-anchor`）、冻结分区的 sticky 偏移（`grid-freeze-layout`）、合并单元格布局、覆盖层矩形裁剪、单元格格式到样式的映射。共性是输入输出全是值：数字、范围、尺寸集合、样式对象。

必须留下的：DOM ref 与滚动锚点的持有、`ResizeObserver` 的创建与断开、pointer capture 与拖拽会话的终止清理、焦点恢复、ARIA 属性写入。共性是它们拥有浏览器资源的生命周期。

这一步最重要的产出其实是一条判定规则，写在每份边界文档里：**「仅仅没有 `solid-js` import 不足以判定为共享代码」**。很多模块不导入 Solid，却仍然依赖当前组合 runtime、atom reader 或浏览器事件生命周期——比如 `grid-layout.ts` 调用的全是纯几何函数，但它自己读取 atom-backed reader 和 DOM 锚点，不能整体下沉。靠 grep 画边界会画错。

## 第二步：下沉按责任裁决，不按「可移植」标签

候选清单出来后，下一个问题是：下沉到哪。这里出过一次真正的架构裁决（ADR 0012），核心是两个准入问题：

1. 它是不是无头的工作簿/UI 事实、命令或纯领域规则？是 → 进 UI-core。
2. 若否，它是不是把已给出的 UI 事实变成布局、覆盖层几何、结构化样式值的**表面纯计算**？是 → 进一个独立的共享展示层。

两个答案都是否，代码就不下沉——「可移植」标签本身不是理由。这条裁决防住了一个具体的腐坏路径：如果只以「当前没有 DOM import」为准入，UI-core 会逐步接住元素、测量和挂载责任。

配套的是一条比直觉更严的硬约束：UI-core 必须**完全 DOM-free**，不仅不能 import DOM API，也不得以回调、reader 或不透明对象的形式转移这些责任进来。共享展示层同样只能接收显式的值或框架中立 reader、返回数据，不能替适配器取得元素、注册原生事件或拥有清理资源。值得注意的是，ADR 0012 只命名了共享展示层及其边界，刻意不创建包——这个决定的后果下文会诚实交代。

裁决之后才是搬代码（AD-316~318：滚动几何、grid 坐标辅助、非 grid 交互分批进 ui-core，Solid 消费者逐批回归），然后把「一个不依赖任何框架的宿主该长什么样」写成文档契约：

- **headless 挂载契约**（AD-320）：一次挂载会话必须持有并在卸载时释放五类句柄——`store.sub` 的取消函数、`subscribeContentChanges` 的取消函数、滚动监听器、`ResizeObserver`、进行中的指针操作取消器。可见投影读取必须走命令生命周期（begin 得到 started 才允许调后端，成功失败各经 resolve/reject 结算），同时只允许一个活动传输；命令派发没有泛化的 `dispatch(command)`，只有具体端口。会话之间不得复用任何订阅取消函数、DOM 引用或滚动锚点。
- **DOM 测量抽象**（AD-321）：行列尺寸和视口测量被定义为框架侧实现的接口，浏览器测量不得伪装成 backend 元数据。
- **vanilla POC**（AD-322/323）：用零框架的只读与编辑 demo 证明上述契约真的够用——如果 vanilla JS 都能挂载，React 和 Vue 就只是订阅形态问题。
- **档 1 范围冻结**（AD-325）：首版只做「能看能编」十二个表面——网格、滚动、冻结、选区、键盘导航、编辑、IME、公式栏、名称框、sheet 标签、剪贴板、撤销重做。工具栏、全部对话框、筛选排序 UI、批注、协作、右键菜单明确排除。范围冻结不是偷懒，是防止两条框架线的验收标准漂移。

## 第三步：两条框架线，各有各的坑

到这一步，React 和 Vue 适配包（`excel/react-excel`、`excel/vue-excel`）的形态已经被前面的工序决定了：Provider 供一个隔离的 UI core，受控视图渲染调用方给的投影，一批 hook 桥接到既有 ui-core 命令。产品状态全部留在 ui-core atom 里——框架局部状态不是第二个表格 store。两个包的目录几乎互为镜像：同名的 `use-spreadsheet-selection / -editing / -clipboard / -history` 等十余个 hook，一一对应档 1 的表面。

「受控视图」值得单独说一句：`SpreadsheetGridView` 不取数、不改工作簿，可见范围、`DisplayCell[]` 投影和选区全部由调用方传入；`SpreadsheetFrozenGridView` 只是把同一份调用方投影切成冻结分区。取数、worker 接线、投影刷新策略都留给宿主应用。这不是功能残缺，是挂载契约的直接推论——投影生命周期归 ui-core 命令拥有，适配层如果自己发请求，就会在框架侧长出第二条数据通路。

**React：`useSyncExternalStore` 与订阅竞态。**桥的两端是一个框架中立的 source（`{ getSnapshot, subscribe }`）和 React 的外部 store 契约。为什么必须用 `useSyncExternalStore` 而不是 `useState` + `useEffect`：React 18 的并发渲染允许一次渲染被打断、交错，同一帧里两个组件可能读到外部 store 的不同快照（tearing）；外部 store 契约让 React 自己保证一致性，而表格 source 仍是值的唯一拥有者。并发正确性专门有一个验证叶子（AD-333），钉的是一个容易漏的竞态：值在首次 render 之后、`subscribe` 真正挂上之前变了怎么办。`useSyncExternalStore` 会在订阅挂上后重查快照，测试用一个「订阅前偷偷换值」的假 source 把这个行为锁死。Provider 侧用 `useMemo([backend, store])` 创建 core——换 backend 是刻意语义，等于换一个工作簿。另有一个叶子（AD-351）专门处理「默认 Provider 隔离」：Solid 侧那次「一个进程两份 solid-js 导致 Provider 重挂」的事故（ADR 0001）在 React 侧被移植成了等价的单实例约束。踩过的坑要在每个框架再防一次。

**Vue：`shallowRef` + `effectScope` 与回收。**Vue 桥用 `shallowRef` 承载快照——值由外部 store 拥有，深层响应式代理既没必要也有害。真正的坑在清理：订阅挂在一个专用 `effectScope` 里，调用方在组件 scope 内使用时 `onScopeDispose` 自动断开；在 scope 外使用则拿到显式 `dispose`。验证叶子（AD-363）钉两个行为：外层 scope stop 时恰好取消订阅一次；`dispose` 调两遍不重复取消。React 的坑在订阅的开始，Vue 的坑在订阅的结束。Vue 线还多出一个消费形态叶子（AD-381）：同一个受控视图必须同时可从 SFC 的 `<script setup>` 和 render 函数的 `h()` 消费，并用 `vue/compiler-sfc` 编译真实 SFC 挂进 jsdom 作证——因为 Vue 生态里这两种宿主都真实存在。

**两条线共享的东西比预期多。**worker backend 不用重写——`SpreadsheetBackend` 是框架中立的，React 和 Vue 的 worker 接线测试直接复用 solid-excel 的 worker 工作簿后端（`createWorkerWorkbookSpreadsheetBackend`），同一个 WASM worker 服务三个框架。网格几何也不用重写：重活（轴偏移、滚动吸附、视口归一化）在夯实阶段已沉进 ui-core 的 `viewport/` 目录，适配包里的 `spreadsheet-grid-geometry.ts` 只是约 200 行的薄组合。

诚实说一个没做优雅的地方：这份薄组合在两个包里几乎逐行相同——diff 只有注释里的框架名。按 ADR 0012 它属于「表面组合」，归共享展示层，但那一层至今只有名字没有包，于是先复制。这是清楚记账的技术债，不是被忽略的重复。

## 第四步：三框架共享面

两条线落地后还有收口（AD-390）：一份行为分歧裁决规程（当 React 和 Vue 对同一用户可见行为不一致时怎么收集证据、裁给谁），一份框架 × 后端的 e2e 证据矩阵。裁决规程里最有用的一句约束：把已实现行为如实记为各自现状，不得由一个框架反推另一个框架已有同一能力——防止「共享事实」被某个框架的实现细节污染。

证据的形态也和 Solid 线对齐：两个适配包各有自己的 Playwright `e2e/adapter-selection` 目录（附 CASES.md 用例清单），在真实浏览器里验证指针选区；站点上各有一个受控投影 demo。验收以叶子为单位逐个记录提交号，而不是一句「React/Vue 已支持」。

## 现状与边界

到本文写作时，React 与 Vue 两条线的档 1 叶子（包骨架、订阅桥、Provider、worker 接线、几何、只读与冻结网格、选区、指针、键盘、编辑、IME、公式栏、名称框、sheet 标签、剪贴板、历史、浏览器 e2e、站点 demo）均已逐叶验收。但两个适配包仍是 private、未发布 npm；范围就是档 1「能看能编」。这不是谦虚，是前面那套「已实现的才是现状」规程的自我约束。

如果你也要给单框架库补适配层，我们的路径可以压缩成三句：先用逐 import 的审计画边界，别信「没有 import 就是中立」；下沉按责任裁决并写成 ADR，让「可移植」标签失去权力；把挂载契约做成 vanilla 能跑的文档，再让每个框架各自解决订阅的开始（React 的竞态）与结束（Vue 的回收），并把旧框架踩过的坑（Solid 的单实例）在新框架里再防一次。

仓库：https://github.com/allroad88888888/einfach-excel
