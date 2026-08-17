# 架构图素材（AD-605）

可复用于文章与站点的三层分层与 backend port 图。事实来源:`docs/ARCHITECTURE.md`、
`excel/spreadsheet-ui-core/src/backend/types.ts`、CLAUDE.md「Three-tier layering」。

## 图 1:三层分层与依赖方向

```mermaid
flowchart TB
    subgraph host["宿主应用(Solid / 任意框架)"]
        comp["Solid 组件<br/>SpreadsheetUiProvider · SpreadsheetGrid · 对话框族"]
    end
    subgraph core["@einfach/spreadsheet-ui-core(无 DOM / 无 worker / 无 WASM)"]
        atoms["交互状态 atoms<br/>selection · editing · find/replace…"]
        port["SpreadsheetBackend 端口<br/>3 必需方法 + 可选端口族"]
    end
    subgraph engine["引擎(worker 内)"]
        wasm["Rust/WASM 工作簿<br/>@einfach/excel-wasm"]
        ts["TS 引擎(parity 参照)<br/>@einfach/excel-core-ts"]
    end
    comp --> atoms
    comp --> port
    port -->|RPC| wasm
    port -->|RPC| ts
```

## 图 2:可见窗口投影(载荷跟视口,不跟工作簿)

```mermaid
sequenceDiagram
    participant Grid as SpreadsheetGrid
    participant Core as UI core(投影校验)
    participant BE as Backend(worker)
    Grid->>Core: 视口矩形(行/列窗口 + overscan)
    Core->>BE: readVisibleProjection(有界请求)
    BE-->>Core: 窗口内单元格快照
    Note over Core: 越界/超额/过期结果整体拒收<br/>(CELL_OUT_OF_RANGE · RESULT_TOO_LARGE · STALE_RESULT)
    Core-->>Grid: 恰好一屏的数据
```

## 图 3:可选端口的三种降级形态

```mermaid
flowchart LR
    q{"宿主实现了该端口?"}
    q -->|是| on["入口可用"]
    q -->|否| d1["隐藏<br/>(如 pasteRange 菜单项不渲染)"]
    q -->|否| d2["禁用<br/>(如 find/replace 按钮 disabled)"]
    q -->|否| d3["饿死<br/>(如 history 条目不入栈,undo 恒灰)"]
```

出处见 `docs/BACKEND_DEGRADATION.md` 的逐条代码引证。
