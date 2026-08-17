# 文章二配图:状态归属边界前后对比

## 图 1:裁决前——两套真相

筛选可见性只活在 UI 层,引擎按"所有行可见"计算。`SUBTOTAL(1-11)` 把被筛掉的行也加进去,与 Excel 分歧。

```mermaid
flowchart LR
    subgraph UI["UI 层(主线程)"]
        F[筛选规则 + 可见性 atom<br/>唯一知道哪些行可见]
        G[网格渲染<br/>只画可见行]
        F --> G
    end
    subgraph W["Worker(引擎)"]
        E["公式引擎<br/>对筛选一无所知"]
        S["SUBTOTAL(9, A:A)<br/>= 把被筛掉的行也求和 ✗"]
        E --> S
    end
    F -. 从不下发 .-x E
    style S fill:#7a2020,color:#fff
    style F fill:#1f4d7a,color:#fff
```

## 图 2:裁决后——引擎是唯一权威,UI 只持投影缓存

引擎拥有 `Sheet.hidden_rows` 与 `SheetAutoFilter`(规则 + 派生隐藏集),自己求值谓词;UI atom 降级为只在 backend ACK 上写的投影缓存。隐藏**列**是负对照,留在 UI core。

```mermaid
flowchart LR
    subgraph UI["UI 层(主线程)"]
        C["sheetHiddenRowsAtom /<br/>viewportFilterHiddenAtom<br/>投影缓存:只在 ACK 上写"]
        HC["viewportHiddenColsAtom<br/>隐藏列:引擎零建模,留 UI core"]
        G2[网格渲染]
        C --> G2
        HC --> G2
    end
    subgraph W["Worker(引擎)"]
        AF["SheetAutoFilter<br/>规则 + 派生隐藏集"]
        HR["Sheet.hidden_rows<br/>手动隐藏集"]
        SUB["SUBTOTAL 读两个隐藏集<br/>与 Excel 一致 ✓"]
        AF --> SUB
        HR --> SUB
    end
    UI -- "setFilterSort(rules)" --> AF
    AF -- "ACK: hiddenRowIndices" --> C
    style AF fill:#1f6b3a,color:#fff
    style HR fill:#1f6b3a,color:#fff
    style SUB fill:#1f6b3a,color:#fff
    style C fill:#555,color:#fff
```

## 图 3:SUBTOTAL 两档规则——为什么必须两个集合

`SUBTOTAL(1-11)` 包含手动隐藏、排除筛选隐藏;`(101-111)` 两个都排除。集合一旦合并,来源信息丢失,两档规则表达不出来——所以引擎持两个独立集合、两个独立失效 epoch。

```mermaid
flowchart TB
    FH["筛选隐藏集<br/>eval_filter_hidden_rows"]
    MH["手动隐藏集<br/>eval_hidden_rows"]
    P1["SUBTOTAL(1-11)<br/>SubtotalHiddenPolicy::ExcludeFilter"]
    P2["SUBTOTAL(101-111)<br/>SubtotalHiddenPolicy::ExcludeFilterAndManual"]
    FH -- 排除 --> P1
    FH -- 排除 --> P2
    MH -- 排除 --> P2
    MH -. "不排除(照常参与计算)" .-> P1
```

## 图 4:applyFilter 一次往返——谁在求值谓词

引擎跑一遍谓词并同时提交规则与隐藏集;适配器只镜像引擎的答案,不重跑谓词;UI core 在 ACK 上写投影缓存。历史记录用引擎快照 `snapshotFilters` 括前后像,超预算时筛选生效但不进历史。

```mermaid
sequenceDiagram
    participant U as UI core
    participant A as worker 适配器<br/>(filter-sort.ts)
    participant E as 引擎(Rust/WASM)
    U->>A: setFilterSort(rules, recordHistory)
    A->>E: snapshotFilters()(仅当要记历史)
    A->>E: applyFilter(sheet, rules)
    Note over E: 引擎内求值谓词<br/>提交规则 + 派生隐藏集<br/>bump 失效 epoch
    E-->>A: { ok, hiddenRows }
    Note over A: 镜像引擎答案<br/>不重跑谓词
    A->>E: snapshotFilters()(后像)
    Note over A: 变化且未超 cap 才推<br/>filter.set 事务记录
    A-->>U: ACK { hiddenRowIndices, historyRecorded }
    Note over U: 投影缓存只在此刻写<br/>禁止乐观写入
```
