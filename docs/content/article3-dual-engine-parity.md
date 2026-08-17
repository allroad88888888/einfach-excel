# 双引擎 parity 怎么钉住:同一批用例,两个运行时,零人肉对照

我们的表格栈里有两个公式引擎:Rust 编译成 WASM 的主引擎(`excel/rust/excel-core` + `excel/rust/wasm`),和一个纯 TypeScript 的实现(`@einfach/excel-core-ts`)。Rust 是现役主引擎;TS 版是 parity 参照,兼一条不依赖 WASM 的纯 JS 部署路径。两个引擎、一套协议、一份 UI——这个组合最大的风险不是"哪个引擎有 bug",而是**两个引擎对同一个公式给出不同答案,而没有人发现**。这篇文章讲我们怎么把 parity 钉住:不靠人肉对照文档,靠同一批用例双跑;以及哪些差异是刻意允许的。

## 为什么养两个引擎

TS 引擎不是历史包袱,它有两个现役职能。第一,它是**语义参照物**:Rust 引擎的每一类求值行为,都有一个独立实现可以对照——两个引擎在同一个输入上分歧,至少有一个是错的,这比"对照 Excel 文档"可执行得多。第二,它是**纯 JS 部署路径**:不能或不想加载 WASM 的宿主,可以换一个 worker 入口跑在 TS 引擎上。两套 worker 运行时(`worker-runtime.ts` / `worker-runtime-full.ts` 对 `worker-runtime-ts.ts`)实现同一个 RPC 协议,消息循环共用 `worker-runtime-core.ts`,WASM 侧的两个入口只是各自静态 import `@einfach/excel-wasm` 与 `@einfach/excel-wasm/full` 的叶子文件。

但"两个实现一套协议"这句话只有在被持续验证时才成立。验证机制有两层。

## 第一层:e2e 双 project,同一批 spec 各跑一遍

Playwright 配置(`excel/solid-excel/playwright.config.ts`)定义两个 project,除了名字,**唯一**的差别是 baseURL 的查询串:

```ts
projects: [
  { name: 'wasm', use: { ...devices['Desktop Chrome'], baseURL: `${BASE_URL}/?backend=wasm` } },
  { name: 'ts',   use: { ...devices['Desktop Chrome'], baseURL: `${BASE_URL}/?backend=ts` } },
],
```

`e2e/helpers.ts` 的 `gotoRoot(page)` 从 `test.info().project.name` 惰性读取 project 名,给每次导航自动补上 `backend=` 参数。于是 `--project=wasm` 和 `--project=ts` 跑的是**逐字相同的 spec 文件、逐字相同的断言**,只是页面底下换了一个 worker 引擎。没有为 TS 单独维护的用例副本,也就没有"副本忘了同步"这种腐坏方式。

parity 的判定同样机械:分别跑两个 project,diff 两份失败清单。同时红的不是 parity 问题(是 UI bug,"partially red, but identically red");只在一侧红的才是 parity 缺口。审计矩阵 `excel/solid-excel/e2e/BACKEND_PARITY.md` 记录了 2026-06-05 快照:两侧各 478 通过、0 失败,Δ = 0。文档自己也声明这组数字只是当日快照——**汇总数字会过期,逐条差异规则不过期**,要当前结论就自己跑两个 project。审计还有一条纪律:**不加 `test.skip(project === 'ts', …)`**——每个 TS 侧失败要么在 WASM 上也复现,要么作为待查 flake 记录在案,不允许用 skip 把分歧扫进地毯。

## 第二层:jest 里的跨引擎驱动面,断言字面量而不是"两侧相等"

e2e 走完整的浏览器 + worker 链路,慢,且隔着 UI。求值语义的细粒度对照在 jest 层,核心是 `excel/solid-excel/test/cross-engine-parity-engines.ts`:一个 `Engine` 接口盖住两个引擎,场景代码对引擎无感知。两个驱动都跑在 node 侧,但接入点刻意不同:TS 引擎走 `createWorkerRuntimeTs().handle()`——**真实 Worker 跑的那个 RPC 面**,不是绕过协议直调内核;WASM 引擎直接调 wasm-bindgen 方法(它的 dispatcher 在模块加载时自动安装到 `self` 上,jest 里没法干净地实例化两次,这是记录在文件头里的权衡)。WASM 侧还刻意调用**可失败**的 `try*` 绑定并断言 `ok`,这样引擎拒绝写入会当场炸掉,而不是伪装成"写进去了但看不出效果"。

在这个驱动面上,`cross-engine-parity-smoke.test.ts` 维护着一份"已经钉住的分歧类"清单,每一条都曾是活的分歧:错误码词汇(同一公式 TS 读 `#TYPE!`、WASM 读 `#VALUE!`)、算术强制转换(`=1+"5"` 在 TS 上是 6,在 Rust 上曾长期是 `#VALUE!`)、运算符优先级(`=2^2%` / `=-2^2`)、聚合的错误透明度、criteria 与错误值的交互、criteria 的文本比较(大小写折叠、通配符、`~` 转义)。这份文件有一条方法论上的硬规则,值得抄下来:

> 期望值一律断言**字面量**,不只断言「两侧相等」:相等只能证明两个引擎一致,证不了它们一起错,而「一起错」在这份文件的历史里出现过不止一次。

criteria 那类是现成的例子:两侧**各错一半且方向相反**(TS 让错误格一律不匹配、Rust 把 `<>` 退化成 `=`),"两侧相等"这个断言在这类分歧上**从来不会响**。parity 测试的对照物必须是 Excel 语义的闭式期望值,双引擎一致只是顺带的收获。

jest 层内部还有一次分工:烟测(`cross-engine-parity-smoke.test.ts`)与规模套件(`scale-parity.test.ts`)的差别不是"跑不跑",而是**形状**。烟测给每个分歧类一个最小形状——一张表、不走 bulk 导入,失败时地址少到可以直接读;规模套件播种成千上万格的工作负载,负责撞出最小形状撞不出的组合态。烟测必须快到能挂在每一次 `npx jest` 上,所以它有一条准入门槛:只有当一条分歧是**单引擎单测看不见的一整类**时才加场景——单引擎能测的东西放这里只是浪费双跑的成本。

双跑还顺带给了失败一个**分类学**。审计里三个只在 TS 侧红的 e2e 用例(懒渲染格数、分块快照、大 TSV 粘贴),经交叉比对定位为 worker 运行时的 RPC 时序缺口,而不是公式引擎 bug——因为同样的公式在 jest 驱动面上两侧答案一致。没有双跑,这类失败只能笼统记一笔"TS 后端有问题";有了双跑,"引擎语义分歧"、"运行时实现缺口"、"两侧同红的 UI bug"三类各有各的证据形状,修的人不用从头定位。

## 哪些差异是刻意允许的

钉 parity 最容易犯的错,是把"功能覆盖差异"误判成"语义分歧"。BACKEND_PARITY.md 专门有一节讲这个:TS 引擎有几项 Rust 有、它没有的能力(`autoFill`、`sortRange`、`evalHiddenRows`、`evalFilterHiddenRows`、`structuredTables`,后来又加了 `engineHiddenState`),但这些**不是**会在运行时咬人的静默分歧——`worker-runtime-ts.ts` 顶部的能力证词把它们声明成 `false`,UI core 据此撤下对应的宿主端口,入口整个消失;万一有不合规的适配器硬发 RPC,还会收到结构化的 `unsupported` 拒绝,**fail closed**,而不是一个成功形状的假 ACK。一句话:**差的是功能有没有,不是同一次调用答案一不一样。** 宿主在 TS 后端上根本没有办法把隐藏行喂给引擎,所以不存在"隐藏了行之后两个后端算出不同 SUBTOTAL"这种运行时惊喜。这条纪律有前史:早期审计发现 TS worker 存在 fail-open 假 ACK(结构操作 no-op 却返回成功),假 ACK 会把"功能没有"伪装成"功能有但答案不同",是 parity 审计的头号污染源,所以 fail-closed 是双引擎策略的前提而不是细节。

另外两类允许的差异:**调试探针语义**——Rust 引擎对变更是惰性的,TS 引擎是急切的(变更立即重推导缓存公式),所以 `debugFormulaCacheState` 的中间态两侧不同,公共断言只落在两侧都同意的 never-read 态上;**实现路径**——溢出区查询 `spillRegion` 两个运行时都真的实现了,但 WASM 走 `spillAnchor`/`spillInfo` 导出,TS 没有溢出索引、反着往左上扫。路子不同、答案必须相同,所以它不进能力差异表,而是由参数化跑两遍的 `vnext-worker-spill-region.test.ts` 用锚点坐标 + 形状的闭式比较钉住。

## 代价

这套机制不是免费的,值得写清楚。第一是**墙钟**:全量 e2e 双跑,每个 project 约七八分钟,审计一轮就是两轮完整跑加一次人工 diff——所以逐条差异规则要沉淀进 BACKEND_PARITY.md,让下一轮审计只需要核对增量。第二是**每个新能力的两难**:引擎侧每落一个新能力,要么两边都实现,要么在 TS 侧的证词里显式声明 `false` 并接受入口在纯 JS 路径上消失——没有"先在主引擎上线、参照侧以后再说"的中间态,因为那个中间态正是假 ACK 滋生的地方。第三是**用例的生命周期管理**:双 project 审计让早期专为 TS 后端写的影子 spec(专跑 TS demo 页的那两份)大部分冗余了,但它们没有被立即删除,而是记下两条明确的退役条件,条件都满足前保留——删测试和加测试一样,要有可核对的理由。

判据可以收敛成一句:**实现可以不同,能力可以不同,但"同一次调用"的答案不准不同;能力差异必须声明出来并 fail closed,不准静默降级。** 人肉对照文档做不到这件事,同一批用例双跑可以——分歧不是"有人记得去查"才被发现,而是 CI 里两列结果 diff 出来的。

---
仓库:https://github.com/allroad88888888/einfach-excel
