# AD-512：WASM 候选构建物组成测量

父节点：[AD-500：可验证的性能证据](adoption-issues/AD-500-performance.md)。本工具把一个已经
生成的候选构建目录逐资源记录为 WASM、JS glue、worker 或 UI。记录仅描述本地候选构建物，
不是公共包、下载大小、网络传输量、发布物、性能结果或 D2 决策依据。

单个 WASM 候选物的口径仍以 [AD-511 规程](WASM_SIZE_MEASUREMENT_PROTOCOL.md) 为准。本记录
扩展到同一候选目录中的相关资源，不能把各行的 gzip 数字相加后称作请求大小；HTTP 压缩、缓存、
拆包和传输协议均未在这里测量。

## 分类边界

脚本递归扫描传入的候选目录，并按相对仓库路径逐文件输出 `raw_bytes` 与 `gzip_bytes`。
gzip 固定使用 `gzip -n -9 -c`，不写回输入文件。

| component | 规则                                 |
| --------- | ------------------------------------ |
| `wasm`    | 扩展名为 `.wasm`                     |
| `js_glue` | 文件名符合 `einfach_wasm*.js`        |
| `worker`  | 非 glue 的 `.js` 文件名包含 `worker` |
| `ui`      | 其余 `.js`、`.css` 或 `.html` 文件   |

未归类的路径以 `excluded_paths` 原样列出，避免把 source map 或其他附带文件悄然混入某个字节数。
每个组件是独立文件记录，不产生组合 gzip 总数。

## 采集步骤

先在仓库根目录从干净或明确记录的工作树生成要测量的候选目录；脚本故意不执行构建，防止把
旧候选物误当作刚生成的结果。例如，测量 Solid Vite 候选目录：

```bash
npm run build -w @einfach/solid-excel
node scripts/measure-ad512-size-composition.mjs \
  --candidate excel/solid-excel/dist \
  --build-command 'npm run build -w @einfach/solid-excel' \
  > /tmp/ad512-solid-candidate.json
```

记录 JSON 含 `candidate_path`、`revision`、`worktree`、`captured_at_utc`、实际
`build_command`、gzip 命令与运行工具版本。先运行构建命令，再立刻测量；构建输入、修订、
候选路径、压缩工具或分类规则变化时应另存一份记录，不能推导比较结论。

`wasm-pkg` 或 `wasm-pkg-full` 目录也可作为候选路径。它们通常只有 WASM 与 glue；空的
`worker` 或 `ui` 数组表示该目录不含这类资源，不代表任何宿主交付边界。

## 验证

分类与临时小文件测量覆盖在本地 Node 测试中，不会默认触发 WASM 构建：

```bash
node --test scripts/measure-ad512-size-composition.test.mjs
npm run check:docs
npx prettier --check scripts/measure-ad512-size-composition.mjs \
  scripts/measure-ad512-size-composition.test.mjs docs/WASM_SIZE_COMPOSITION.md
```

这些命令只验证记录方法。任何面向用户的体积、加载或性能主张仍需要相应公开证据与发布门禁。
