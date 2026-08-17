# 三个方法起步的 headless backend port：一个表格 UI 内核的最小契约

做在线表格，大家的注意力通常在两头：渲染层怎么虚拟化，公式引擎怎么算得快。但真正决定这套东西能不能长期演化的，是中间那条线——UI 和数据源之间的契约长什么样。这篇文章讲我们在 einfach-excel 里的做法：一个叫 `SpreadsheetBackend` 的接口，必需面只有三个方法，其余七十多个成员全部可选。

## 背景：三层结构里，port 是唯一的缝

整个表格栈分三层：

- `@einfach/spreadsheet-ui-core`——无头的 UI 状态与命令层，只有 atom、类型和投影契约，不碰 DOM、不碰 worker、不碰 WASM；
- `solid-excel` 的适配层——Solid 组件、Provider、各种 adapter；
- Rust/WASM 公式引擎——跑在 Web Worker 里，持有工作簿事实。

规则是硬的：工作簿事实（单元格值、公式、依赖图）住在 backend port 后面，不进 UI atom。UI core 对数据源的全部认知，就是 `excel/spreadsheet-ui-core/src/backend/types.ts` 里的这一个接口。它目前有两个参考实现：`static-backend.ts`（纯内存，供冒烟测试和静态 demo）和 worker 工作簿后端（`adapter/worker/backend.ts`，RPC 到持有 WASM 工作簿的 worker）。worker 侧甚至有两套引擎（Rust/WASM 与 TS）实现同一协议，靠同一批 e2e 用例钉 parity——契约是不是真的框架无关、引擎无关，这里每天都在被测试回答。

## 必需面为什么只有三个方法

接口里不带 `?` 的方法恰好三个：

```ts
readVisibleProjection(request): Promise<VisibleProjectionResult>
readRangeProjection(request): Promise<RangeProjectionResult>
setCellInput(request): Promise<BackendMutationResult>
```

翻译成用户语言：能看（渲染当前可见窗口）、能按命令读一块显式范围（复制、填充这类操作要拿一个矩形的数据）、能编（把一格的原始输入提交回去）。这就是「一个东西还能被叫做电子表格」的地板。

为什么把地板压这么低？因为契约的必需面决定了最小宿主的成本。一个想接自己数据源的宿主——CRM 里嵌一块只读带编辑的网格、报表系统接一个自研存储——它不该为了用这套 UI 而先实现排序、批注、条件格式、动态数组。三个方法起步，几百行内存实现就能跑通整个 UI；剩下的能力按需要长。

另一个原因更内在：必需面越小，契约越难腐坏。每个进入必需面的方法都是对所有现有和未来宿主的一次强制迁移；而可选端口的新增是零成本的——老宿主不实现，对应功能不出现，仅此而已。这个接口从三个方法长到今天的七十多个成员（73 个可选方法，外加一个只读能力字段），没有任何一次扩张要求已有后端改代码。

`setCellInput` 虽小，ACK 语义却是严格的：resolve 一个 `BackendMutationResult` 意味着写入真的落地了。宿主写不进去就必须 reject，不能返回一个长得像成功的对象——否则用户的键入悄悄消失，而 UI core 已经记了历史、推了 revision。类型注释里把这条写死了，因为它是整个乐观 UI 不需要存在的原因：UI 不预测写入结果，它等真 ACK。

## Degrade without knowing：可选端口的哲学

可选端口不是「懒得实现的方法」，而是能力声明。UI core 的规则是：**宿主省略某个端口时，对应的工具栏项、菜单入口、快捷键直接不出现——UI 分不清「宿主没实现」和「这个功能不存在」，而且这是刻意的。**

几个真实例子（都在 `types.ts` 的注释里，注释即契约）：

- `exportRangeAsImage` 缺席，Copy as PNG 菜单项和 `Ctrl+Shift+P` 一起消失，`encodeSelectionAsImage` 返回 `null`；
- `readSpillRegion` 缺席，动态数组的溢出边框整个特性不出现——注释原话是「端口缺席是『功能不存在』，不是错误」。注意 `region: null` 和端口缺席是两回事：前者是明确的「这一格不在任何溢出区里」；
- `setEvalHiddenRows` 缺席，SUBTOTAL 101-111 降级为「不排除隐藏行」（等价于 1-11 的结果），其他一切功能不受波及。这个端口本身也是特殊形态：fire-and-forget 的整集替换，无 ACK 无 undo，幂等；
- TS 引擎不能物理重排数据，于是 TS worker 后端不实现 `sortRange`，物理排序入口经同一套「方法在不在」契约隐藏。同一份 UI，跑在两个引擎上，能力面自动不同。

这个哲学还有几层更细的刀法：

**能力可以再细分，且 fail-closed。**`pasteRange` 存在但引擎只会贴值不会贴格式？声明 `pasteRangeSupportedKinds`，UI core 在派发前就挡掉不支持的种类；字段缺席则是完全信任。

**结果字段的缺席也是降级信号。**`setFilterSort` 的 ACK 里，`hiddenRowIndices` 缺席表示「宿主根本算不出可见性」——UI core 清掉自己的过滤隐藏集，降级为「规则已记录、什么都不隐藏」，而不是猜着隐藏可能错的行。空数组则是另一个明确答案：「规则什么都没滤掉」。

**被拒绝是 resolve，不是 reject。**`sortRange`、`createTable` 这类端口被门禁挡下时，resolve 一个结构化的 not-applied 结果（带 `code`：范围里有溢出区、名字冲突、超 256 上限……），承诺「什么都没写、没记 undo、revision 未动」。Promise rejection 留给真正的异常。UI 于是能区分「引擎说不行」和「链路断了」。

**降级也有反方向。**保护（protection）功能的权威在 UI core 侧，`setSheetProtection` / `readSheetProtection` 只是可选的持久化钩子——后端全省掉，保护功能反而是完整的，因为强制执行发生在 UI core 的 mutation gateway。同一套「可选端口」语法，方向可以相反：谁是 canonical owner，谁的端口就退化成镜像钩子。`exportRangeTsv` 的 `hiddenRows` 参数是同一原则的另一面：过滤可见性是 UI core 的视图事实，所以它作为**输入**传给端口，而不是让 adapter 自己查一份快照——端口是执行者，永远不是权威，否则就多出第二份会分叉的真相。

## 有界投影：为什么拒收越界数据

三个必需方法里两个是「投影」读取，这个词选得很克制。投影是显示数据，不是工作簿状态。`docs/PROJECTION_BOUNDARY_CONTRACT.md` 把边界写成了双向的收紧：

进的方向：请求必须命名一个 sheet、一个矩形窗口、一个非零请求 id；矩形要过配置的 cell 数上限（默认 50,000）才允许开始。出的方向：结果必须与请求的 kind、sheet、id、矩形、revision 逐项对上；**每个返回的 cell 必须落在请求矩形内，结果的 cell 总数不能超过矩形容量**；对不上当前活动请求的迟到结果按 stale 丢弃。这些全部由 `projection-contract.test.ts` 钉死。

为什么要拒收「多给的数据」？后端多算了一点，缓存下来不是白赚吗？

不是。一旦 UI 侧开始保留越界数据，投影就悄悄变成了第二份工作簿状态：滚动路过的区域被攒下来，订阅集随浏览历史增长，「可见窗口有界」的全部不变式失守。契约文档把红线列得很直白——投影不得变成 workbook fact store、公式缓存、依赖图、或离屏稀疏快照。仓库的 atom 约定与之呼应：禁止 per-cell / per-row / per-col 的 atom family，大表必须由可见窗口投影或有界缓存供给；e2e 里有专门的 perf-virtual 套件盯着「深滚动往返后，活跃订阅集仍是视口大小」这类可观测量。拒收越界 cell 是这一切的第一道闸：腐坏最容易从「顺手缓存」开始。

生命周期同样有界：visible lane 同时只允许一个活动传输，最多一个新请求排队，更新的排队请求替换旧的。请求携带 `requestId` / `revision` / `cancelToken`，worker 可以据此扔掉过期工作。显式范围读取走独立的 range lane，结果交还给发起它的命令（比如复制），不允许反过来替换可见显示快照。

## 收尾

回头看，这个接口的设计只有一句话：**必需面是地板，可选面是能力声明，边界是拒收器。**三个方法让最小宿主几百行起步；七十多个可选成员让 WASM 引擎的全部能力可以逐个 wave 长出来，每个端口出生时就带着自己的降级答案；有界投影保证这条缝永远只是缝，不会淤积成第二份真相。

如果你也在做「UI 一套、数据源多套」的东西，我们踩出来的经验是：先想清楚每个功能缺席时用户看到什么，再写接口——降级路径不是错误处理，是契约本体。

仓库：https://github.com/allroad88888888/einfach-excel
