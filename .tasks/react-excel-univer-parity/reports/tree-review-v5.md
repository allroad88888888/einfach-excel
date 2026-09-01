# React Excel · Rust/WASM 任务树 v5 独立终审

VERDICT: NEEDS_CHANGES

审查日期：2026-09-01  
审查基线：产品 HEAD `fc174dfc7a9542ea6c198747d644d24c737f6a27`；任务树未提交。  
范围：完整读取 `index.md` / `stages.md` / `coverage.md` / `baseline.md` / `ledger.md`、
001–020、101–114、`tree-review-v3.md` 与 `tree-review-v4.md`；核对当前 Rust/WASM binding、
React/UI-core API、TypeScript package resolution、Vite/Playwright 与 worktree。本次只新增本报告。

## 结论摘要

v4 报告的三个 Critical 和四个 Important 已大部分按真实 API 闭环；特别是
`installed:false` 现已按已应用 mutation ACK，package-root HTML 已改相对入口，017 也已在
019 前发布 default runtime。但新增的 private source-package 连接方式会让 017 的必跑
TypeScript 验收失败；S01 另有两组跨叶合同/初始化 owner 未冻结。因此仍不能派发 001。

## v4 finding 逐项闭环

| v4 finding | 当前状态 | 证据/裁决 |
|---|---|---|
| C1 `installed:false` 已改 Rust 却 reject | 主行为闭环 | `index.md:59-65`、`009:30-31`、`014:31-33` 均把两个 `ok:true` 分支视为 applied；014 bump revision 且 105 经 `runEditingCommitAtom` refresh。`installed:true` wire 还有一个新精确性问题，见 I4。 |
| C2 package-root Vite HTML | 闭环 | `018:21-23,35-45` 已拥有两个旧 HTML，冻结 `./main.tsx`，验四个 2xx URL；`019:37` 在第三个 input 存在后首次实跑 `build:e2e`。 |
| C3 019 早于 public export | 导出时序闭环 | `017:20-24,40-45` 已拥有 `src/index.ts` / package-entry test，019 可从 root 消费且 root import 验零 Worker side effect。但其 TS project-reference 实现不可执行，见 C1。 |
| I1 RustWorkerSheet/hook/context/workspace 签名 | 闭环 | `index.md:120-156,164-185`、`006:30`、`011:34-36`、`016:27-33`、`101:31-34` 已给出一致签名与 owner。 |
| I2 `toImportCellWire` owner/consumer | 功能主线闭环，有账本漂移 | 003 是唯一 owner，015 root export，014/017 是真消费者；010 仍错指 task009，见 M1。 |
| I3 active `<td>` id extension | 闭环 | `index.md:195-203`、`103:33-39` 先修 renderer/viewport 并验真实 `td`，104 再透传 active id，files/DAG 也已串行。 |
| I4 E2E server 并发/命令不完整 | 闭环 | 113 现依赖 112；`113:32-33` 与 `114:28-30` 均有四 project 的完整 list/run 命令，`018:38-39` 冻结 server/install 前置。 |

## 已确认成立

- 34 个叶子无环、无未知依赖；当前 waves 结尾为 `111 → 112 → 113 → 114`，不再并发 E2E server。
- 按 frontmatter exact `files` 重算，所有 ready-set 写/写重叠为 0；同波验收均为 targeted test，全包 typecheck/build 在 producer 后。
- 当前 detailed 矩阵 C00–C07/C01 子行与 34 叶 `coverage` 集合双向相等；C08–C12 是明示的后续阶段行。
- baseline 的 HEAD 与 20 个 sha256 当前全部匹配；worktree 除 `.tasks/react-excel-univer-parity/` 外干净。`base:null` 的填写时点已在 `baseline.md:3-5` 冻结。
- 已展开叶子/任务文档均 ≤300 行；将被修改的存量 React/demo 普通文件当前也均 ≤300 行，102/103 已为临界文件写入按职责抽离。
- 未发现 TS core、Solid runtime、TS worker/fallback 进入目标主线；history `unavailable` 是明示 capability guard，不是伪 ACK。

## Critical

### C1. 017 要求的 unbuilt source-package project reference 会使必跑 typecheck 失败

证据：002 定义的 `@einfach/excel-worker` 是直指 `src/index.ts` 的 private source package，
且其唯一 tsc 命令带 `--noEmit` (`002-private-neutral-package.md:31-36,48-52`)。
017 又要 React `tsconfig` “加 project reference”，随后运行
`tsc -p excel/react-excel/tsconfig.json --noEmit` (`017-default-rust-bootstrap.md:39,45`)。真实 React tsconfig
继承 `moduleResolution: "Node"` 且 `rootDir: "src"` (`tsconfig.base.json:20-22`;
`excel/react-excel/tsconfig.json:2-11`)。

已用 TypeScript 5.8.3 的 resolver 对仓库现有同形 source package
`@einfach/react-excel` 实测：Node10 解析为 `undefined`，Bundler 解析到 `src/index.ts`；
一旦加指向未构建 source package 的 project reference，program diagnostic 是 `TS6305: Output file ...
has not been built from source file ...`。project reference 不是 package-name 解析映射，也不会被
`tsc -p --noEmit` 自动构建。

影响：017 无法达到自己的验收，019 的 public fixture、020/114 `verify`
也都被阻断；这与 017 是否正确 re-export 无关。

可执行修订（二选一，首选 A）：

1. **A—保持 private source package**：002 仍可把 excel-worker 加到 workspace 根 reference；017 改为
   React tsconfig 使用 `moduleResolution: "Bundler"`且不添加 excel-worker project reference，同时在 002
   冻结 root 与 `./wasm-worker-factory` 的 source exports。017 的 typecheck 必须真实 import
   package root 和该 subpath。
2. **B—改为 buildable package**：新建独立 build/integration 叶，先生成声明产物，再用
   `tsc -b` 构建 reference 图；不得保留当前“source package + 零 emit + project reference”组合。

## Important

### I1. revision 域同时允许 string 与要求 numeric bump，exact ACK 无法唯一实现

`RustWorkerBackendOptions.revision` 允许 `number | string`，`revision()` 也返回两者，但
`bumpRevision(): number` (`index.md:140-150`)。012 只冻结默认 0→1
(`012-backend-session.md:33-37`)，014 又要 editing ACK 为 positive integer revision
(`014-cell-input-backend-port.md:31-37`)。当 options 传入 string revision 时，agent 无法知道如何 bump，
也不能同时满足签名与 ACK 约束。

修订：M0 最小面把 options/session revision 统一收紧为 non-negative safe integer，
`bumpRevision` 在溢出时 fail-closed；012/014 添加 explicit initial revision、首次 bump、溢出与
strict ACK 测试。若必须保留 string，则需先冻结一个唯一的 string revision 生成/比较合同。

### I2. 104/106 的 public wrapper 没有跨叶可复制签名，109 只能猜 props

index 只声明 `SpreadsheetViewportGridProps/Handle`与 controller 类型
(`index.md:187-212`)，没有 `SpreadsheetSelectableGridProps`、
`SpreadsheetEditableGridProps`、两个 forwardRef export，也没有
`useSpreadsheetEditingCommit(options): SpreadsheetEditingCommitController` 函数签名。104/106 是 producer，
108 只说“追加…及 types”，109 却要从 public API 传 ready sheetId 与 1000×8
(`104:27-33`; `106:27-33`; `108:26-29`; `109:29-31`)。按“agent 只读 index + 本叶”的
全局规则，109 无法知道真实 import/props/ref 形状。

修订：在 index 冻结两个 wrapper props（至少继承 viewport 的 sheetId/count/size/a11y 面）、
`React.ForwardRefExoticComponent<...RefAttributes<SpreadsheetViewportGridHandle>>` export，以及 hook 的完整函数签名；
104/105/106 原样写 producer，108 原样 export，109 原样写 import 与调用。

### I3. 新组合没有 selection bounds 与 ready sheetId 的初始化 owner

104 只组合 pointer/keyboard/selection 并设 active id (`104-selection-grid-wrapper.md:27-38`)，
111 只说 ready backend 创建 Provider (`111-compose-default-demo.md:27-35`)。真实 UI-core 的
default selection bounds 是 1,048,576×16,384，default selection sheetId 是空串
(`excel/spreadsheet-ui-core/src/selection/index.ts:23-36`)；当前 demo 仅手工设了 bounds
(`excel/react-excel/demo/App.tsx:32-36`)，没有设 Rust ready sheetId。

影响：新 Provider/store 若按任务文字组合，首次键盘/F2 操作仍指向空 sheet；键盘也可把
selection 移到 1000×8 之外，而 viewport 只能 clamp 滚动，最终 `aria-activedescendant`
可指向不存在的 cell，edit 则 bad-sheet。

修订：指定唯一 owner（建议 104 wrapper），按 props.rowCount/colCount 调
`setSelectionBoundsAtom`；首次 mount 或 sheetId 切换时，在不覆盖同 sheet 已有 selection 的前提下
把 active selection 安装到 ready `sheetId` 的 A1。单测加入“未点击即 F2/键盘”、下右边界 clamp、
sheet 切换和 active descendant 实体检查；112 至少验一条 initial-keyboard 路径。

### I4. `installed:true` wire 要求 `display`，但真实 binding 与 009 都不产生它

`RustFormulaResultWire` 对 `installed:true` 要求 `display:string` (`index.md:59-65`)。真实
`trySetFormulaAt` 只返回 `{ok:true,installed:true|false}` 或 structured refusal
(`excel/excel-wasm/lite/einfach_wasm.d.ts:672-681`;
`excel/rust/wasm/src/wasm_workbook_writes.rs:117-143`)。009 只要求为 `installed:false`
追读 snapshot (`009-cell-write-handler.md:30-35`)。由于 binding 类型是 `any`，直接把 true 分支
当 wire 返回不会被 tsc 抓到，exact RPC 会少字段。

修订：与 v4 报告原建议对齐，把 true 分支改为
`{ok:true;installed:true}`，仅 false 分支携 snapshot 的 code/message/display；或者明确要求
009 对两个 applied 分支都调一次 `snapshotCell`。同步 index/003/009 的两分支 exact-shape 测试。

## Minor

### M1. classifier owner 与 coverage 精确路径仍有账本漂移

- 010 仍声称 payload 来自 task009 `toImportCellWire`
  (`010-demo-seed-handler.md:30`)，但唯一 owner 已是 003，真消费者是 014/017。改成
  “payload 是 `RustImportCellWire[]`；React seed 由 017 通过 task003 classifier 产生；handler 不重做分类”。
- coverage 的 C01c/C01d1/C01d2/C01e1/C01e2 仍写
  `runtime/commands/*.ts`、`backend/projection.ts`、`backend/cell-input.ts`
  (`coverage.md:73-77`)，而叶子真实产出是 `runtime/handlers/*.ts`、
  `backend/projection/{range-wire,display-cell,port}.ts`、`backend/cell-input/{port,revision}.ts`
  (`008:17-19`; `009:17-18`; `013:17-20`; `014:17-19`)。修正路径后重跑当前已通过的 row↔leaf 双向集合检查。

在 C1 修复并完成 I1–I4/M1 后，再做一次静态复审；在此之前不派发 001。
