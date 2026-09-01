# 001 执行报告：把临时 demo 升成完整产品目录

## 结果

- 包根现在直接持有 `index.html`、`vite.config.ts` 与完整 app `tsconfig.json`。
- `src/main.tsx` 挂载 `src/app/App.tsx`，工作簿业务代码按 backend、chrome、data、editing、grid、
  projection 归位；没有新增 barrel、`components/`、`hooks/` 或 `utils/`。
- `demo/` 已不存在。旧 adapter source、旧 adapter tests 与 `e2e/` 保留给 002，本叶未删除。
- UI 布局与功能保持不变；入口与 header 已使用 workbook / sales-order / row-count 产品语义。产品仍只使用
  `@einfach/solid-excel/vnext-worker-runtime?worker` Rust/WASM runtime。

## 最终文件树

```text
excel/react-excel/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   └── app.css
│   └── workbook/
│       ├── Workbook.tsx
│       ├── workbook.css
│       ├── backend/{rust-backend.ts,rust-seed.ts}
│       ├── chrome/{FormulaBar.tsx,WorkbookFooter.tsx,WorkbookHeader.tsx,WorkbookRibbon.tsx}
│       ├── chrome/{footer.css,formula-bar.css,header.css,ribbon.css}
│       ├── data/sales-orders.ts
│       ├── editing/use-cell-edit.ts
│       ├── grid/{CellEditor.tsx,WorkbookGrid.tsx,cell-editor.css,grid.css}
│       └── projection/use-grid-window.ts
└── test/workbook/
    ├── rust-backend.test.ts
    ├── projection.test.tsx
    └── cell-editing.test.tsx
```

## 验证

- `pnpm --filter @einfach/react-excel typecheck`：通过。
- `pnpm --filter @einfach/react-excel build`：通过；产物含
  `dist/assets/worker-runtime-EQIlkyqm.js` 与 `dist/assets/einfach_wasm_bg-F_LgCihr.wasm`。
- `pnpm exec jest excel/react-excel/test/workbook/rust-backend.test.ts
  excel/react-excel/test/workbook/projection.test.tsx
  excel/react-excel/test/workbook/cell-editing.test.tsx --runInBand --no-coverage`：3 suites、12 tests 通过。
- 产品 source 静态扫描没有 `@einfach/excel-core-ts`、`worker-runtime-ts` 或 fallback；Rust worker import
  恰在 `src/workbook/backend/rust-backend.ts`。
- `demo/` 不存在；package scripts 不再引用 demo config。
- `pnpm exec eslint --config rules/.eslintrc --ignore-path rules/.eslintignore
  excel/react-excel/test/workbook/rust-backend.test.ts`：通过。
- 新产品目录与三个迁移测试共 25 个文件，全部 `wc -l` ≤300；最大文件是
  `test/workbook/cell-editing.test.tsx`，289 行。
- `git diff --check`：通过。

## 偏差与疑虑

- 无。001 按合同暂时继续消费旧 `@einfach/react-excel` bridge；该边界由 002 处理。
