# 一个进程里的两份 solid-js:Provider 重挂之谜

> AD-606 初稿 / AD-607 定稿合一。技术事实对齐 `docs/decisions/0001-solid-js-single-instance.md`(ADR 0001);
> 代码引用全部摘自真实文件。配图 mermaid 源码见同目录 `article1-diagrams.md`(图 1 / 图 2 两处占位)。

## 症状:组件函数体不该跑第二次

Solid 的核心承诺与 React 相反:组件函数体只在挂载时执行一次,之后的更新走细粒度信号,不重跑函数体。我们的表格项目选 Solid,很大程度上就是买的这个承诺。

但在 `Provider` 下,这条铁律破了:消费者组件的函数体会在**普通 atom 变更时**重新执行。每次 `setter` 一个不相干的 atom,对话框里的局部 signal 被重置、`createEffect` 重挂——整个组件像被卸载又重装了一遍。

后来钉死这个行为的契约测试,把症状浓缩成了十几行(`excel/solid-excel/test/provider-remount-1912.test.tsx`):

```tsx
const a = atom(0)
const i = atom(null, (get, set) => set(a, get(a) + 1))
const store = createStore()
let bodyRun = 0
function Probe() {
  bodyRun += 1
  const v = useAtomValue(a)
  return <div>{v()}</div>
}
render(() => (
  <Provider store={store}>
    <Probe />
  </Provider>
))
store.setter(i)
store.setter(i)
store.setter(i)
expect(bodyRun).toBe(1)
```

在坏掉的日子里,`bodyRun` 随每一次 `setter` 递增。

对一个以 atom 为中心的架构,这个症状的破坏力是全局的:表格的每一次单元格提交、每一次选区移动都在写 atom,也就意味着屏幕上所有打开的对话框、所有持有局部状态的消费者组件都在被反复重建。它不是某个组件的 bug,是整层 UI 的地基在晃。

## 错误假设:"1.9.12 的 Provider 有 bug"

这个现象曾长期被归因为「solid-js 1.9.12 与 Provider 交互有 bug」。理由看起来充分:换 solid-js 版本,时好时坏——还有什么比"版本相关"更像版本 bug?

于是团队做了版本 bug 对应的处置:绕。把每实例状态搬进 `createSignal` 局部变量,不行;全部塞进 atom,状态确实不再丢,但函数体照样重跑。workaround 改善了症状的破坏力,根因一动没动。

这个假设能活很久,还有一层原因:它**无法被便宜地证伪**。"框架版本 X 有 bug"是一个只能靠读框架源码或最小复现才能推翻的命题,而绕过方案又真的缓解了疼痛——于是没有人有动力去推翻它。错误假设最舒服的形态,就是一个附带着还算能用的 workaround 的假设。

事后看,"换版本时好时坏"恰恰是解谜的钥匙——只是当时读反了方向。

## 真相:一个进程里有两份物理 solid-js

2026 年 6 月定位到根因:**不是版本 bug,是一个进程里存在两份物理的 solid-js**——历史上 `core/solid` 解析到 1.9.5,`excel/solid-excel` 解析到 1.9.12。两处依赖在不同时间解析到了不同版本,pnpm 的隔离式 `node_modules` 不做强行去重,忠实地各留了一份:每个包看到的都是"自己那份"solid-js,模块级状态互不相通。这不是 pnpm 的错——它只是不再替你掩盖依赖图里本来就存在的分裂,而 hoist 式的包管理器会碰巧把这个问题藏起来一部分时间。

教科书式的双实例症状是 context 查找失败:`createContext` 的 key 是 `Symbol`,两份实例各造各的 Symbol,`useContext` 拿到 `undefined`,当场报错,响亮但好查。我们踩的是更阴险的变体:`Provider` 和 `useAtomValue` 都住在 `@einfach/solid` 里,解析到**同一份** solid-js——context 查找是成功的。坏在另一个模块级全局上。

看 solid-js 1.9.12 的 `createProvider` 源码(`dist/dev.js`):

```js
function createProvider(id, options) {
  return function provider(props) {
    let res;
    createRenderEffect(() => res = untrack(() => {
      Owner.context = { ...Owner.context, [id]: props.value };
      return children(() => props.children);
    }), undefined, options);
    return res;
  };
}
```

`children()` 是一个 memo。而 Solid 的依赖追踪靠一个**模块作用域**的全局变量:

```js
let Listener = null;
```

信号被读取的那一刻,谁在 `Listener` 里,谁就订阅了这个信号。组件实例化时 `createComponent` 会 `untrack`——临时把 `Listener` 置空,保证组件体里读信号不建立订阅:

```js
function untrack(fn) {
  if (!ExternalSourceConfig && Listener === null) return fn();
  const listener = Listener;
  Listener = null;
  ...
```

两份实例时,链条断在哪一环就清楚了。称 `@einfach/solid` 解析到的那份为 A、应用 JSX 编译到的那份为 B:

1. A 份的 `createProvider` 用 **A 份自己的** `children()` memo 包裹 children。memo 求值时,`Listener_A` = 这个 memo。
2. children 里的消费者组件由 B 份实例化,B 份的 `untrack` 只清得掉 `Listener_B`——`Listener_A` 原封不动。
3. 消费者体内 `useAtomValue` 读信号。signal 是 A 份的 `createSignal` 创建的,检查的是 `Listener_A`——不为空,于是 **children memo 被登记成了这个信号的订阅者**。
4. 此后任何 atom 变更:信号通知订阅者 → children memo 重算 → children 整个重建 → 消费者函数体重跑。

*(图 1:双副本依赖泄漏链路,mermaid 源见 `article1-diagrams.md`)*

这也解释了"换版本时好时坏":**任一版本单独存在都是正常的,分裂本身才是 bug。** 调整版本 range 偶尔让依赖图收敛成一份,就"好了";下一次依赖变动再分裂,又"坏了"。版本号是无辜的,ADR 0001 把这句话写成了标题:进程内只允许一份 solid-js。

## 修复:一行配置,三道护栏

修复本身小得配不上排查它花的时间——根 `package.json` 一条 override:

```json
"pnpm": {
  "overrides": {
    "solid-js": "1.9.12"
  }
}
```

*(图 2:修复后单实例下的正常链路,mermaid 源见 `article1-diagrams.md`)*

但真正的决策不是这一行,而是把「**依赖图只能解析到一个物理的 solid-js 运行时**」确立为不变式,并配上护栏。

**护栏一:lockfile 门禁。**

```bash
grep -oE '^  solid-js@[0-9.]+' pnpm-lock.yaml | sort -u
# 必须只输出 solid-js@1.9.12
```

这条 grep 自己也返工过一次。最初的 pattern 没有锚定行首,而 Astro 的 Solid 集成叫 `@astrojs/solid-js`,自己的版本号是 7.0.1——它一进 lockfile,未锚定的 pattern 就从包名后缀里匹配出 `solid-js@7.0.1`,门禁哭着报告"出现了第二个 solid-js"。在今天的 lockfile 上实测:未锚定的写法数出 23 处 `solid-js@1.9.12` 加 2 处 `solid-js@7.0.1`,后者全部来自 `@astrojs/solid-js@7.0.1` 这一个依赖。锚定到 lockfile 依赖 stanza 的行首才算修好。教训的教训:**校验规则也是代码,也会有 bug**——一个会喊错狼来了的门禁,比没有门禁腐蚀得更快,因为它教会所有人忽略它。

**护栏二:契约测试。** 就是开头那个 `expect(bodyRun).toBe(1)`。它锁的是行为不是实现:哪天 pnpm 更换 hoist 策略,或某个新依赖把 solid-js 拖成两份,这个测试红了会把人准确送到依赖图前——ADR 里的原话是:「去修依赖图,不要在组件里绕」。

**护栏三:刻意不做的事。** 评估过在包内做运行时双实例告警(类似 React 的 duplicate-React 警告),结论是不做:包内运行时无法可靠发现 resolver graph 里的第二个分支,这类告警必然存在假阳性或假阴性。守这条不变式只能在依赖图层面守,不指望运行时自救。

顺带一句,这次修复没有放宽状态归属约定:产品状态仍必须放在 atoms 里,Solid 本地状态只承载 DOM 引用、一次性测量值这类非产品状态。当年把状态搬来搬去救不了重挂,恰好证明这两件事是正交的——解耦之后,约定反而立得更稳。

## 对库作者的教训:peerDependencies 声明的是"共享同一份实例"

复盘下来,最值得带走的不是 Solid 的内部细节,而是一类问题的通用形状。

**依赖模块级全局的库,天然是单例库。** React 的 dispatcher、Solid 的 `Listener` / `Owner`、Vue 的 `currentInstance`——这些框架的正确性都建立在"全进程只有一份我"之上。对这类库,`peerDependencies` 的真正意义从来不是省安装体积,而是一份契约声明:「**我必须与宿主解析到同一个物理实例,否则不保证正确**」。把 solid-js 写进自己 `dependencies` 的库,等于在下游埋一颗 range 一漂移就引爆的雷。pnpm 的隔离式 `node_modules` 让分裂更容易发生,monorepo 又放大了它的隐蔽性。

**双实例的症状谱系很宽,而且大多不指向根因。** 最响的是 context 查不到;最阴险的是这里这种——一切都能跑,只是框架表现得"像另一个框架"。所以当一个成熟框架表现出违反自身核心语义的行为时,排查顺序应该是:先问"它在我的进程里有几份",再问"它是不是有 bug"。前者一条 grep 就能回答,后者可能耗掉几周。读到这里不妨顺手查一下自己的仓:在 lockfile 里数一数 react、vue 或 solid-js 解析出了几个版本——注意锚定行首,别让 `@types/react` 或 `@astrojs/solid-js` 这类包名后缀骗到你,我们已经替你踩过这一步了。

**修好之后,用三样东西钉死它:** 机制(overrides 收敛依赖图)、门禁(lockfile 上一条锚定好的 grep)、契约(一个断言行为的测试)。三者缺一不可——机制会被新依赖冲开,门禁会有自己的 bug,测试红了不解释原因。三道叠在一起,下一个引入 Solid 相关依赖的人才会在提交前被拦住,而不是在三个月后的诡异重渲染里重走一遍这条路。

原始修复提交(`2b7d65e`)在 einfach 主仓的历史里;表格栈 2026 年 7 月底拆分成独立仓时,把 overrides 和契约测试一起带了过来,并在次日把整段叙述沉淀成 ADR 0001。bug 修掉一个多月之后专门回头补写 ADR,是因为这个坑值得一个可引用的编号——现在,它有了。

---

仓库:einfach 主仓 <https://github.com/allroad88888888/einfach>(表格栈拆分仓 ADR 0001:《进程内只允许一份 solid-js》)
