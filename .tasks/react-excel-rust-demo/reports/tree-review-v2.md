# NEEDS_CHANGES

复核日期：2026-09-01

范围：完整复读当前 `index.md`、001–003，并复核现有 worker runtime、RPC client、
backend、React viewport 与 demo。只新增本报告，不改产品或任务文件。

## 阻断项

### 1. 001 指定的 `worker-backend` ESM 目标并不存在

001 要求新 package export “精确指向现有
`src/adapter/worker-workbook-backend.ts` 及其既有 esm/types 产物”（`001:29-30`）。
源码 wrapper 与
`excel/solid-excel/@types/src/adapter/worker-workbook-backend.d.ts` 存在，但对应的
`excel/solid-excel/esm/src/adapter/worker-workbook-backend.mjs` 不存在。若执行 agent 按
合同写 `import/default` 条件，Vite 会解析到不存在的文件，001 build 无法通过。

仓库已有且成对存在的是：

- `src/adapter/worker/backend.ts`
- `esm/src/adapter/worker/backend.mjs`
- `@types/src/adapter/worker/backend.d.ts`

最小修正：把 `./worker-backend` 的 `solid` / `import` / `types` / `default` 四个条件
精确写成上述三个真实文件（`import` 与 `default` 同指 `.mjs`），并把 001 的入口测试
断言改成这组映射。仍然只改 package export，不改 backend 实现，也不会经过 Solid
public barrel。

### 2. 001 的 no-Solid 验收命令在当前基线必然失败

001 原命令把两个包名写在同一个 alternation 中，且 scoped package 没有结束边界，会误匹配
`worker-factory.ts:15` 注释里的
`from '@einfach/solid-excel/vnext-worker-runtime-full?worker'`。已在当前基线执行，
`rg` exit code 为 0，因此前置 `!` 必然使验收失败；全局又禁止修改该源码来迁就扫描。

最小修正：给包名加结束/子路径边界，例如：

应拆成两条精确扫描，并用字符类表达 scoped package 的分隔符与结束边界，避免文档链接
检查器把正则里的包名当作本地路径。

或采用等价的精确 import specifier 扫描。

## 上轮四项复核结果

- **直接复用边界已闭环**：任务现在直接使用
  `@einfach/solid-excel/vnext-worker-runtime?worker`，不经过同时含 TS factory 的
  `worker-factory.ts`；backend 通过独立子路径消费。除上述路径笔误外，不新增或复制
  worker、RPC、dispatcher、WASM surface、backend。
- **002 写集与公式栏已闭环**：`App.tsx`、`demo-data.ts`、新 `RustWorksheet.tsx` 均在
  002 files；合同删除静态 cell map，并要求公式栏读取当前 Rust projection。验收与写集
  一致。
- **003 refresh 语义已闭环**：合同区分初始 effect 与显式 refresh，要求 projection
  error 落库后 reject；测试明确覆盖 mutation ACK + refresh reject、只写一次及 retry
  authority。与 `runEditingCommitAtom` 的 `refresh-failed` 语义一致。
- **编排责任已闭环**：三个执行叶均不提交、不改状态；独立 review、状态回写、单独提交
  与最终 `awaiting_user` 均归编排者。
- **功能与文件边界通过**：用户功能仍严格只有打开、滚动选择、单格编辑三项。新文件
  按 backend bootstrap、seed、worksheet composition、windowing、editor 与 edit hook
  分责；无重复 runtime 或 Solid UI 接入。所有叶均保留普通文件 `wc -l <=300` 验收，
  当前将修改的存量文件也未出现无法规避的行数阻断。

修正以上两个 001 机械问题后，当前任务树即可派发。
