# 贡献指南

感谢你对 einfach-excel 的关注！欢迎提交 issue 和 pull request。

## 环境要求

- Node.js >= 18（CI 覆盖 18 与 20）
- [pnpm](https://pnpm.io/) 10
- Rust 工具链 + `wasm32-unknown-unknown` target + [wasm-pack](https://rustwasm.github.io/wasm-pack/)

## 开始

```bash
git clone git@github.com:allroad88888888/einfach-excel.git
cd einfach-excel
pnpm install
```

## 开发流程

1. Fork 并克隆仓库
2. 创建特性分支：`git checkout -b feat/my-feature`
3. 构建：`npm run build`
4. 运行测试：`npm test`；lint：`npm run lint:check`
5. 需要发版的改动：`npx changeset`
6. 提交变更并创建 Pull Request

## 项目结构

```
excel/spreadsheet-ui-core/ → @einfach/spreadsheet-ui-core  # 框架无关的表格 UI 核心（atoms / 类型 / 投影契约）
excel/solid-excel/         → @einfach/solid-excel          # Solid.js 表格界面（src-vnext 现役）
excel/excel-site/          → @einfach/excel-site           # 演示 / 门面站（private）
excel/excel-core-ts/       → @einfach/excel-core-ts        # TS 公式引擎（private，parity 参照 + 第二 worker 后端）
excel/rust/core/           → einfach-core (crate)          # Rust atom store
excel/rust/excel-core/     → einfach-excel-core (crate)    # Rust 公式 / 工作簿引擎
excel/rust/wasm/           → einfach-wasm (crate)          # WASM 绑定
```

上游 `@einfach/core` / `@einfach/solid` 从 npm 安装，不是 workspace 依赖。架构分层见
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 代码风格

- 无分号，单引号，100 字符行宽（Prettier）
- 严格 TypeScript（`strict: true`、`isolatedModules: true`）
- 禁止 `console` 语句（ESLint）
- 类型导入使用 `type` 关键字
- 每个文件只负责一件事；普通文件 ≤ 300 行，强内聚的算法/状态机核心 ≤ 500 行。改动会顶破上限时，
  拆分就是本次改动的一部分

```bash
npm run lint:check   # 只检查
npm run eslint       # 检查并自动修
```

## 文档规则

文档腐坏的根因是「契约」和「某次会话的现场记录」混在同一层，读者无法分辨。本仓因此把文档分成四类，
**每类有不同的生命周期**：

| 类型 | 是什么 | 住哪 | 生命周期 |
|---|---|---|---|
| **契约** (reference) | 描述**现状**，贴着代码放 | `src/<feature>/README.md`、`e2e/<feature>/CASES.md`、`CUSTOM_FORMULAS.md` | 随代码 PR 同步更新 |
| **决策** (ADR) | 一次技术裁决 + 理由 | `docs/decisions/NNNN-*.md` | 接受后**不改内容**，只能被新 ADR 标记 superseded |
| **提案** (plan) | 前瞻计划，文件名带日期 | `<pkg>/docs/*_YYYY-MM-DD.md` | 落地时：结论上移进契约或 ADR，本体 `git mv` 进 `archive/` |
| **记录** (record) | handoff / audit / perf 报告 / 协作看板 | `<pkg>/docs/archive/` | 生成即冻结，直接住归档区 |

硬规则：

1. **文件名带日期 = 冻结。** 不要修它的内容，只归档。要更正结论就写新文档。
2. **文档里禁写会腐坏的全局计数。** 不写「本包有 419 个测试」，写出「怎么算」的命令。
   需要登记规模时，用 `CASES.md` 那种「源码路径引用 + 单文件行数」的口径。
3. **归档一律 `git mv`** 以保留历史；并做三件事：加状态横幅（`> ⚠️ 冻结记录（YYYY-MM），
   仅供考古，现行契约见 <指针>`）、在 `archive/INDEX.md` 登记一行、**清扫反向引用**
   （源码注释和 CI 里可能有指向该文档的路径）。
4. **改了公共 API、目录结构或后端 port，就要同步对应的契约文档**，与代码在同一个 PR 里。

这两件事有门禁，本地和 CI 跑同一份（pre-commit 也会跑）：

```bash
npm run check:docs
```

它检查活文档的相对链接是否存在，以及是否出现已知的失效路径形态（拆仓迁出的 `core/*`、
退役的 `excel/showcase`、平铺时代的 `e2e/*.spec.ts`、老仓绝对路径）。`archive/` 豁免 ——
冻结记录里的死链是史实的一部分。讲迁移本身的文档需要引用旧路径时，在文件里写一行
`<!-- doc-check: allow-stale-paths -->` 豁免。

## 版本管理

使用 [Changesets](https://github.com/changesets/changesets)：

```bash
npx changeset          # 创建变更集
npx changeset version  # 更新版本号
npx changeset publish  # 发布到 npm
```

## 测试

```bash
npm test                                              # 全量（含覆盖率）
npx jest path/to/file.test.ts                         # 单个文件
npx jest excel/spreadsheet-ui-core --no-coverage      # 分区套件
npx jest excel/solid-excel --no-coverage

npm run e2e:install -w @einfach/solid-excel           # 首次装浏览器
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel
```

## 许可证

MIT
