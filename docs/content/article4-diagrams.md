# 文章四配图：三个方法起步的 headless backend port

## 图 1：三层结构与 port 的位置

契约（`SpreadsheetBackend`）是 UI core 对数据源的全部认知；两个参考后端与两套 worker 引擎都实现同一接口。

```mermaid
flowchart TB
    subgraph UI["@einfach/spreadsheet-ui-core（无头：atom + 类型 + 投影契约）"]
        ATOMS[UI 状态 atoms<br/>选区 / 编辑 / 历史 / 视口]
        PROJ[有界投影<br/>projectionSnapshotAtom]
        CMD[命令层<br/>只调用存在的端口]
    end

    PORT{{"SpreadsheetBackend port<br/>必需 3：readVisibleProjection ·<br/>readRangeProjection · setCellInput<br/>可选 70+：能力声明"}}

    subgraph HOSTS["宿主适配层（可替换）"]
        STATIC[static-backend<br/>纯内存参考实现]
        WORKER[worker 工作簿后端<br/>adapter/worker/backend.ts<br/>RPC 到 Web Worker]
    end

    subgraph ENGINES["Worker 引擎（双后端 parity）"]
        RUST[Rust / WASM 引擎<br/>现役主引擎]
        TS[TS 引擎<br/>parity 参照，省略 sortRange 等端口]
    end

    CMD --> PORT
    PROJ --> PORT
    PORT --> STATIC
    PORT --> WORKER
    WORKER --> RUST
    WORKER --> TS
```

## 图 2：可选端口的降级判定（degrade without knowing）

UI core 只看「方法在不在」，分不清「宿主没实现」和「功能不存在」——刻意如此。

```mermaid
flowchart TD
    START([UI core 装配某个功能表面]) --> HAS{backend 上<br/>对应端口存在？}
    HAS -- 不存在 --> HIDE[隐藏工具栏项 / 菜单入口 / 快捷键<br/>功能整体不出现，不是报错]
    HAS -- 存在 --> SUB{有更细的能力声明？<br/>如 pasteRangeSupportedKinds}
    SUB -- 有 --> GATE[fail-closed：<br/>派发前挡掉未声明的种类]
    SUB -- 无 --> FULL[完全信任端口]
    GATE --> CALL[调用端口]
    FULL --> CALL
    CALL --> RES{结果形态}
    RES -- "resolve：applied" --> OK[记历史 / 推 revision / 刷投影]
    RES -- "resolve：结构化 not-applied<br/>（带 code，什么都没写）" --> SOFT[走 outcome 路径<br/>区别于链路异常]
    RES -- "reject（真异常）" --> ERR[进对应失败生命周期]
    RES -- "ACK 字段缺席<br/>如 hiddenRowIndices" --> DEG[按「宿主算不出」降级：<br/>规则已记录、什么都不隐藏]
```

## 图 3：有界投影的请求生命周期与拒收点

```mermaid
sequenceDiagram
    participant Host as 宿主（滚动/命令）
    participant Core as 投影命令（UI core）
    participant BE as SpreadsheetBackend

    Host->>Core: begin(visible-window, 矩形, requestId)
    Note over Core: 入口校验：非空矩形、<br/>非负整数边界、<br/>cell 数 ≤ 上限（默认 50,000）<br/>不过 → 后端读取根本不发生
    Core->>BE: readVisibleProjection(request)
    Note over Core: visible lane 单活动传输，<br/>新请求最多排队 1 个，<br/>更新者替换排队者
    BE-->>Core: VisibleProjectionResult
    Note over Core: 出口校验：kind/sheet/id/矩形/revision 逐项对上；<br/>每个 cell 必须在矩形内；<br/>cell 总数 ≤ 矩形容量；<br/>不匹配活动请求 → 按 stale 丢弃
    Core->>Host: projectionSnapshotAtom（只读快照）
    Note over Host,Core: 投影 = 显示数据。<br/>不是 fact store / 公式缓存 /<br/>依赖图 / 离屏稀疏快照
```

## 图 4：必需面与可选面的构成

```mermaid
flowchart LR
    subgraph REQ["必需面（3 个方法 = 地板）"]
        R1[readVisibleProjection<br/>能看]
        R2[readRangeProjection<br/>能按命令取范围]
        R3[setCellInput<br/>能编，ACK 即落地]
    end
    subgraph OPT["可选面（73 方法 + 1 能力字段，按 wave 生长）"]
        O1[结构操作：行列增删 / 合并 / 冻结 / 行高列宽]
        O2[数据功能：筛选排序 / 查找替换 / 表格 / 溢出区]
        O3[导入导出：TSV / PNG / 分块导入]
        O4[协作与推送：presence / subscribeContentChanges]
        O5[镜像钩子：protection 持久化<br/>缺席时功能反而完整（UI-core canonical）]
    end
    REQ -->|"每个可选端口出生时<br/>自带降级答案"| OPT
```
