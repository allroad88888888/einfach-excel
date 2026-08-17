# 文章三配图:同一用例集 → 两个运行时的矩阵

## 图 1:e2e 双 project——同一批 spec,唯一差别是 `?backend=`

Playwright 两个 project 跑逐字相同的 spec 文件;`gotoRoot` 从 project 名自动补 `backend=` 参数;只有 `VNextWorkerDemo` 消费该参数,其余 demo 硬连各自后端(在两个 project 上结果天然相同)。parity 判定 = diff 两份失败清单。

```mermaid
flowchart TB
    S["同一批 e2e spec<br/>(feature 目录,零副本)"]
    S --> PW["--project=wasm<br/>baseURL ?backend=wasm"]
    S --> PT["--project=ts<br/>baseURL ?backend=ts"]
    PW --> DW["VNextWorkerDemo<br/>→ Rust/WASM worker"]
    PT --> DT["VNextWorkerDemo<br/>→ @einfach/excel-core-ts worker"]
    PW -.-> DH["其余 demo:硬连后端<br/>两个 project 结果相同"]
    PT -.-> DH
    DW --> RW["失败清单 wasm"]
    DT --> RT["失败清单 ts"]
    RW --> D{"diff"}
    RT --> D
    D -->|两侧同红| UB["UI bug<br/>(identically red,非 parity 问题)"]
    D -->|单侧红| PG["parity 缺口<br/>(不许 test.skip 掩盖)"]
    style PG fill:#7a2020,color:#fff
    style UB fill:#555,color:#fff
```

## 图 2:jest 跨引擎驱动面——一个 Engine 接口,两个接入点,字面量期望

场景代码对引擎无感知;TS 走真实 RPC 面,WASM 直调 wasm-bindgen 的可失败 `try*` 绑定;断言字面量而非"两侧相等"(相等证明不了"一起错")。

```mermaid
flowchart TB
    W["WORKLOAD<br/>(夹具 + 地址 + 闭式期望值,单一来源)"]
    W --> I["Engine 接口<br/>bulkImport / read / setFormula / snapshot…"]
    I --> T["ts 驱动<br/>createWorkerRuntimeTs().handle()<br/>真实 Worker RPC 面<br/>beginImport → importChunk → commitImport"]
    I --> M["wasm 驱动<br/>WasmWorkbook 直调 bindgen<br/>try* 可失败绑定 + 断言 ok<br/>bulk_install_workbook"]
    T --> RT["Reading(ts)"]
    M --> RM["Reading(wasm)"]
    RT --> A1["expect(ts) = 字面量期望"]
    RM --> A2["expect(wasm) = 同一份字面量期望"]
    A1 --> C["Excel 语义闭式值<br/>双引擎一致只是顺带收获"]
    A2 --> C
    style C fill:#1f6b3a,color:#fff
```

## 图 3:能力差异 ≠ 分歧——证词、撤端口、fail closed

TS 运行时把缺失能力声明成 `false`;UI core 撤下端口、入口消失;不合规的硬发 RPC 收到结构化 `unsupported`,不是成功形状的假 ACK。差的是功能有没有,不是同一次调用答案一不一样。

```mermaid
flowchart LR
    subgraph TS["worker-runtime-ts.ts"]
        CAP["能力证词<br/>autoFill:false / sortRange:false<br/>evalHiddenRows:false / evalFilterHiddenRows:false<br/>structuredTables:false / engineHiddenState:false"]
    end
    CAP --> UC["UI core:撤下对应宿主端口"]
    UC --> HIDE["工具栏 / 菜单 / 快捷键入口消失<br/>(功能整体不可达,零静默降级)"]
    ROGUE["不合规 adapter 硬发 RPC"] --> RPC{"RPC 网关"}
    RPC -->|"结构化 unsupported"| FC["fail closed ✓"]
    RPC -.-x|"成功形状的假 ACK"| FO["fail open ✗<br/>(早期审计实锤,W1 收口)"]
    style FC fill:#1f6b3a,color:#fff
    style FO fill:#7a2020,color:#fff
```

## 图 4:三类差异的处置矩阵

```mermaid
flowchart TB
    Q1{"该行为两个引擎<br/>都实现了吗?"}
    Q1 -->|"只有一侧有"| W1["能力证词声明 false<br/>撤端口 + fail closed<br/>例:sortRange / structuredTables"]
    Q1 -->|都实现| Q2{"同一次调用<br/>答案必须一样吗?"}
    Q2 -->|是| W2["同一用例双跑钉住<br/>例:spillRegion(WASM 查导出,<br/>TS 反向扫,答案闭式比较)"]
    Q2 -->|"探针/中间态,语义不同"| W3["只断言两侧都同意的态<br/>例:debugFormulaCacheState<br/>(Rust 惰性 vs TS 急切,<br/>公共断言只落 never-read)"]
    style W1 fill:#555,color:#fff
    style W2 fill:#1f6b3a,color:#fff
    style W3 fill:#1f4d7a,color:#fff
```
