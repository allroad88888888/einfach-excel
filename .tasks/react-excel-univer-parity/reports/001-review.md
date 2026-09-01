VERDICT: APPROVED

# 001 · Rust-only boundary 独立审查

## 结论

未发现阻断项。指定三份产物满足任务 001 的 Rust-only 文档、扫描范围、负测、baseline、行数与命令验收要求。

## 证据

- Rust-only 路径与失败语义完整：`docs/ARCHITECTURE.md:50-71` 和
  `excel/react-excel/README.md:11-32` 均冻结 React → private neutral
  `@einfach/excel-worker` → `@einfach/excel-wasm` → Rust `excel-core`，并明确 Static/TS backend
  不是产品 fallback；load/manifest/init/seed 失败进入 error/retry，retry 新建 Rust worker generation。
- 禁止 token 精确为任务要求的七项，见 `rules/react-rust-only-boundary.test.mjs:16-24`。
- 扫描范围覆盖 React `src/demo/e2e`、React `package.json` 与整个未来
  `excel/excel-worker/**`，见 `rules/react-rust-only-boundary.test.mjs:26-35,41-48,63-87`；worker
  目录缺席时返回空文件集，目录出现后递归扫描所有普通文件，因此其 manifest、dependencies/peers、源码与
  Worker URL 都纳入门禁。
- 负测覆盖全部七个 token 且逐项断言报错包含文件路径和 token，见
  `rules/react-rust-only-boundary.test.mjs:126-138`；另有 React dependency/peer fixture
  (`:140-154`) 与 private worker URL fixture (`:156-164`)。独立临时 fixture 探针还分别把
  `@einfach/excel-core-ts` 写入未来 worker manifest 的 `dependencies`、把 `solid-js` 写入
  `peerDependencies`，两次均返回 `excel/excel-worker/package.json` 与对应 token。
- README baseline 保留：base 中 README 的 SHA-256 为
  `aaf866832dae33a59eb564fe7fc0b6deac72bdf758226a4d6fef231d8fafe6d9`，与
  `baseline.md` 记录一致；相对 base 的 numstat 为 `24 0`，即只追加 24 行、无删除。
- 三份产物物理行数分别为 174、135、164，均不超过普通文件 300 行上限；职责分别是架构边界、包级使用说明、
  可执行边界门禁，未见跨职责或假拆分。
- 交付报告所列命令和结果与本次复跑一致；指定范围内未修改 `rules/.eslintrc`。

## 验收复跑

```text
$ node --test rules/react-rust-only-boundary.test.mjs
tests 11; pass 11; fail 0

$ git diff --check -- docs/ARCHITECTURE.md excel/react-excel/README.md rules/react-rust-only-boundary.test.mjs
(无输出，exit 0)

$ wc -l docs/ARCHITECTURE.md excel/react-excel/README.md rules/react-rust-only-boundary.test.mjs
174 docs/ARCHITECTURE.md
135 excel/react-excel/README.md
164 rules/react-rust-only-boundary.test.mjs
```
