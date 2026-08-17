# 文章五配图：给 Solid 库补上 React/Vue 适配层

## 图 1：三层责任划分（核心图）

按 ADR 0012 的裁决：交互事实进 UI-core，表面纯计算归共享展示层（已命名、未建包），事件 / ref / 清理留在各框架适配器。

```mermaid
flowchart TB
    subgraph L1["UI-core（@einfach/spreadsheet-ui-core）— 完全 DOM-free"]
        F1[工作簿/UI 事实与命令<br/>选区 · 编辑状态机 · 键盘意图 · 历史]
        F2[纯领域规则<br/>A1 引用解析 · 提交编排 · 剪贴板文本转换]
        F3[已下沉的几何<br/>viewport/axis-geometry · scroll-anchor · freeze]
        NOTE1[硬约束：不得以回调 / reader /<br/>不透明对象转移 DOM 责任进来]
    end

    subgraph L2["共享展示/交互层 — ADR 0012 只命名未建包"]
        S1[表面纯计算：冻结布局 · 合并布局 ·<br/>覆盖层几何 · 格式→样式映射 · 锚定菜单几何]
        S2[只收值或框架中立 reader，返回数据<br/>不取元素 · 不注册事件 · 不拥有清理]
        S3[现状：薄组合 spreadsheet-grid-geometry<br/>在 react/vue 包各留一份 —— 记账的技术债]
    end

    subgraph L3["框架适配器 — 事件 / ref / 生命周期各自拥有"]
        SOLID[solid-excel<br/>signal/effect · JSX<br/>坑：单实例（ADR 0001）]
        REACT[react-excel<br/>useSyncExternalStore 桥<br/>坑：订阅前快照竞态]
        VUE[vue-excel<br/>shallowRef + effectScope 桥<br/>坑：scope 回收与幂等 dispose]
    end

    L3 -->|订阅 atom · 派发命令| L1
    L3 -->|传值调用| L2
    L2 -.->|读取显式事实| L1
```

## 图 2：下沉裁决的两个准入问题（ADR 0012）

```mermaid
flowchart TD
    C([一个 DOM-free 候选]) --> Q1{输入输出都是工作簿/UI 事实、<br/>坐标、范围、文本或 Atom 命令，<br/>且不表达渲染表面的样式/元素/资源？}
    Q1 -- 是 --> UICORE[目标：UI-core<br/>无头事实 / 命令规则]
    Q1 -- 否 --> Q2{是否只是把已给出的 UI 事实<br/>变成布局、覆盖层几何、<br/>结构化样式的表面纯计算？}
    Q2 -- 是 --> SHARED[目标：共享展示/交互层<br/>只收值与中立 reader，返回数据]
    Q2 -- 否 --> STAY[不下沉：留在框架适配器<br/>「可移植」标签不是理由]
    STAY -.-> WARN[没有 solid-js import ≠ 可共享：<br/>可能仍依赖组合 runtime、<br/>atom reader 或浏览器事件生命周期]
```

## 图 3：真实工序的依赖链（AD-300）

```mermaid
flowchart LR
    subgraph P1["AD-310 可移植性夯实"]
        A311[AD-311 耦合审计<br/>136 个 solid-js 导入逐条登记]
        A312[AD-312~314<br/>grid / 编辑选区 / 交互边界]
        A315[AD-315 下沉裁决<br/>= ADR 0012]
        A316[AD-316~319<br/>分批下沉 + 回归]
        A320[AD-320~323 挂载契约 +<br/>DOM 测量 + vanilla POC]
        A325[AD-324/325 样式独立 +<br/>档 1 范围冻结「能看能编」]
        A311 --> A312 --> A315 --> A316 --> A320 --> A325
    end
    P1 --> R[AD-330 React 线<br/>骨架→订阅桥→Provider→<br/>worker→几何→交互→e2e→demo]
    P1 --> V[AD-360 Vue 线<br/>与 React 逐面对齐 + SFC 双形态]
    R --> S[AD-390 共享面<br/>行为分歧裁决规程 ·<br/>框架 × 后端 e2e 矩阵]
    V --> S
```

## 图 4：两个订阅桥的并发/回收差异

```mermaid
sequenceDiagram
    participant Store as ui-core source<br/>(getSnapshot / subscribe)
    participant R as React 桥<br/>useSyncExternalStore
    participant Vue as Vue 桥<br/>shallowRef + effectScope

    Note over Store,R: React 的坑在订阅的开始
    R->>Store: getSnapshot()（首次 render）
    Store-->>R: 值 A
    Note over Store: 订阅挂上前值变为 B（竞态窗口）
    R->>Store: subscribe(onStoreChange)
    R->>Store: 挂上后重查快照
    Store-->>R: 值 B（AD-333 测试钉死）

    Note over Store,Vue: Vue 的坑在订阅的结束
    Vue->>Store: subscribe()（在专用 effectScope 内）
    Store-->>Vue: 更新 → value.value = getSnapshot()
    Note over Vue: 组件卸载 / 外层 scope.stop()
    Vue->>Store: unsubscribe 恰好一次；<br/>显式 dispose 幂等（AD-363 测试钉死）
```
