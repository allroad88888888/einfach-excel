# APPROVED

复核日期：2026-09-01

范围：最终复读当前 `index.md`、001–003，只复核既定阻断门；未修改产品或任务文件。

## 最终门禁

- **backend 子路径可执行**：001 已把 `./worker-backend` 的 `solid`、`types`、
  `import/default` 精确指向现存的
  `src/adapter/worker/backend.ts`、`@types/src/adapter/worker/backend.d.ts` 与
  `esm/src/adapter/worker/backend.mjs`。三个文件均已在仓库核实存在，不经过 Solid
  public barrel，也不要求新增 backend 实现。
- **no-Solid 扫描可执行**：修正后拆成两条包名扫描，并用字符类限定 scoped package
  的分隔与结束边界；两条命令在当前 adapter 基线实际执行通过，不再误命中包自身。
- **无重复 worker/RPC/backend**：宿主直接加载
  `@einfach/solid-excel/vnext-worker-runtime?worker`，backend 只从新中性子路径导入；
  任务禁止 factory 模块、TS runtime/core/fallback，并以构建产物审计验证单一 Rust
  worker 与 WASM asset。没有新 worker package、协议、dispatcher、WASM surface 或
  backend。
- **功能范围准确**：树只交付打开 1000 条数据、滚动选择、单格编辑回读三项；003
  明确排除公式栏编辑、剪贴板、撤销、Sheet 与格式功能。
- **002 可独立执行**：`App.tsx`、`demo-data.ts`、`RustWorksheet.tsx` 均纳入写集；静态
  `DEMO_CELLS`/coordinate map 被移除，公式栏读取当前 Rust projection，验收与 files
  一致。
- **003 错误语义闭环**：显式 refresh 在 projection error 落库后 reject；初始 effect
  负责吞掉外层 rejection；mutation ACK + refresh reject 的 `refresh-failed`、单次写入、
  revision/retry authority 均有定向验收。
- **编排责任一致**：执行 agent 只写报告、不提交、不改状态；独立 review 后的状态
  回写与单独提交归编排者；003 review 通过后由编排者设置 `awaiting_user` 并只给三步
  人工验收。
- **DAG / SRP / 行数**：001→002→003 顺序消除了共享 `App.tsx`/`DemoGrid.tsx` 的写冲突；
  新文件按 backend bootstrap、seed、worksheet composition、windowing、editor、edit
  hook 与样式分责，无 `utils`/`partN` 假拆分。各叶均含普通文件 `wc -l <=300`
  验收，当前四份任务文档也均低于 300 行。

未发现阻断，可派发 001。
