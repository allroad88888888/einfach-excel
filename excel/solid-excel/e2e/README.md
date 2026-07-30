# e2e 套件

Playwright 浏览器测试，**按功能点分目录**。每个目录一份 `CASES.md`，它是该功能点 e2e 覆盖的
权威说明 —— 场景清单、存量用例映射、缺口（本轮补 / 明确延后）。

分目录的裁决与迁移不变式见 [ADR 0005](../../../docs/decisions/0005-e2e-feature-folders.md)。

## 怎么跑

```bash
npm run e2e:install -w @einfach/solid-excel                        # 首次装浏览器
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel   # 全量
npm run e2e -w @einfach/solid-excel -- e2e/smoke/                  # 只跑一个功能目录
npm run e2e -w @einfach/solid-excel -- e2e/formula/formulas-wasm.spec.ts
```

CI 是 4 片矩阵（`.github/workflows/e2e.yml`，advisory 模式）。`--shard=x/4` 按测试**文件**均分，
与目录层级无关。

## 目录

| 目录 | 覆盖 |
|---|---|
| `smoke/` | 冒烟与回归基线 |
| `selection/` | 选区、多区间、扩选 |
| `navigation/` | 键盘导航、go-to、name box |
| `editing/` | 单元格编辑、提交/取消 |
| `formula/` | 公式栏、求值、自动补全、引用拾取 |
| `custom-formulas/` | 宿主注册的自定义公式（含异步） |
| `format/` | 单元格格式、格式刷 |
| `number-format/` | 数字格式 |
| `clipboard/` | 复制/粘贴、选择性粘贴 |
| `copy-as/` | 导出为 TSV / PNG 等 |
| `data-ops/` | 分列、去重、数据操作 |
| `filter-sort/` | 筛选与排序 |
| `find-replace/` | 查找替换 |
| `conditional-format/` | 条件格式 |
| `data-validation/` | 数据验证 |
| `merge-freeze/` | 合并单元格、冻结窗格 |
| `rows-cols-outline/` | 行列增删隐藏、分组折叠 |
| `sheets/` | 工作表标签、多表 |
| `named-ranges-tables/` | 命名区间、Excel Table |
| `comments/` | 批注与备注 |
| `protection/` | 工作表保护、锁定单元格 |
| `history/` | 撤销/重做 |
| `toolbar-shell/` | 工具栏、菜单、外壳 |
| `i18n-a11y/` | 国际化与可访问性 |
| `perf-virtual/` | 虚拟滚动与性能预算 |
| `worker-backend/` | worker 后端、双运行时 parity |
| `demos/` | 演示页 |

## 根目录里的两个文件

- `helpers.ts` —— 所有 spec 唯一的相对导入（`../helpers`）。
- `BACKEND_PARITY.md` —— 双后端（Rust/WASM 与 TS）parity 矩阵。

## 加用例的顺序

先更新对应目录的 `CASES.md` 场景清单，再写 spec。单文件 ≤ 300 行。

**不要在文档里写「本套件有 N 个用例」** —— 这类计数一定会腐坏。`CASES.md` 的口径是
「源码路径引用 + 单文件行数登记」，需要总数时现场算：

```bash
npx playwright test --list -w @einfach/solid-excel 2>/dev/null | tail -1
```
