# 001 · Rust-only boundary 交付报告

## 改动

- `docs/ARCHITECTURE.md` 冻结 React → private neutral worker →
  `@einfach/excel-wasm` → Rust `excel-core` 的唯一产品路径，并明确 load、manifest、init、seed
  失败只能进入 error/retry，不能回退 Static/TS backend。
- `excel/react-excel/README.md` 追加相同的包级约束与 scanner 命令；原 README baseline 未删除或改写。
- `rules/react-rust-only-boundary.test.mjs` 扫描 React `src/demo/e2e/package.json` 和
  `excel/excel-worker/**`。新 worker 包缺席时放行；出现后扫描源码、worker URL、dependencies 与
  peerDependencies。fixture 逐项注入全部七个禁用 token，并断言错误包含路径。

## 验收命令与结果

```text
node --test rules/react-rust-only-boundary.test.mjs
```

结果：通过，11 tests / 11 pass / 0 fail。

```text
git diff --check -- docs/ARCHITECTURE.md excel/react-excel/README.md rules/react-rust-only-boundary.test.mjs
```

结果：通过，无输出。

```text
wc -l docs/ARCHITECTURE.md excel/react-excel/README.md rules/react-rust-only-boundary.test.mjs
```

结果：分别为 174、135、164 行，均不超过普通文件 300 行上限。

## Baseline 保留

以任务 base `b940da7480da6482fb75141d855bb8ebbbda7257` 对 README 执行 `git diff --numstat`，
结果为 `24  0`：只追加 24 行，未删除 baseline 内容。派发前已有的任务文件与 ledger 改动保持原样，
本任务未触碰 `rules/.eslintrc`，未提交。
