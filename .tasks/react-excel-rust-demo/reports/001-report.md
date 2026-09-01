# 001 执行报告

状态：DONE

## 变更

- 为 `@einfach/solid-excel` 新增精确指向现有中性实现的 `./worker-backend` export，没有修改 backend、worker 或 RPC 实现。
- React demo 直接通过 `@einfach/solid-excel/vnext-worker-runtime?worker` 创建 Rust Worker，并从新的 `@einfach/solid-excel/worker-backend` 创建 backend。
- 初始化 `orders` / `Orders` sheet 后，以 `mode: 'direct'` 分 500 格上限的 chunk 导入 1 行表头和 1,000×8 数据，共 8,008 格；逐块校验累计 normalized 数，并校验 commit stats。
- App 在 ready 前不挂载工作簿，明确呈现 loading、error、ready；初始化失败不回退静态 backend，卸载或失败时 dispose。
- 单测固定 package export、direct import、8,008 格、有限 chunk、累计 importChunk 语义和失败 stats。
- ready 后的网格外观按本叶合同暂时保留旧静态投影，002 再接 Rust viewport projection。

## 验证

- `pnpm exec jest excel/react-excel/test/rust-demo-backend.test.ts --runInBand`：3/3 通过。
- 两条 `solid-excel/src/adapter` 禁止导入扫描：通过。
- React demo 的 worker factory / TS runtime / TS core 禁止扫描：通过。
- `pnpm --filter @einfach/react-excel typecheck:demo`：通过。
- `pnpm --filter @einfach/react-excel build:demo`：通过。
- 构建产物包含 `worker-runtime-EQIlkyqm.js` 与 `einfach_wasm_bg-F_LgCihr.wasm`；dist TS fallback 扫描：通过。
- 新增/大改文件行数：App 139、backend 85、seed 71、test 103，均不超过 300。
- `git diff --check`：通过。
- 真实 preview 在 1440×900 与 390×844 下截图检查：Rust/WASM ready 可见，桌面和窄屏布局正常。
- 提交钩子反馈后移除测试对 package backend 与 Vite demo backend 的静态 import：先注册 Worker mock，再用字符串 `jest.requireActual` 加载真实导出与被测模块，并以测试本地最小函数形状断言类型。定向 ESLint、Jest 3/3、demo typecheck 与根级 `pnpm exec tsc -b --pretty false` 均通过。

未提交；未修改任务状态或 index，保留编排者已有改动。
