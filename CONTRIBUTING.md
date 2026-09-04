# 贡献指南

感谢你对 einfach-excel 的关注！欢迎提交 issue 和 pull request。

## 环境要求

- Node.js >= 22.12（CI 覆盖 22.12 与 24）
- [pnpm](https://pnpm.io/) 10
- 完整构建或涉及 Worker 的验证还需要 Rust 工具链、`wasm32-unknown-unknown` target 与
  [wasm-pack](https://rustwasm.github.io/wasm-pack/)

## 开始

```bash
git clone https://github.com/allroad88888888/einfach-excel.git
cd einfach-excel
pnpm install
```

已配置 GitHub SSH 的贡献者也可以使用：

```bash
git clone git@github.com:allroad88888888/einfach-excel.git
```

## 没有 Rust/wasm 工具链时的贡献

未安装 Rust 工具链、`wasm32-unknown-unknown` target 和 `wasm-pack` 的贡献者，仍可处理文档、链接、契约说明，以及不依赖
生成 Worker 产物的 TypeScript 代码或定向测试。

提交前，请按改动范围运行不需要 Worker 构建的检查，例如：

```bash
pnpm check:docs
pnpm check:presentation
pnpm lint:check
pnpm typecheck:mainline
pnpm exec vitest run path/to/file.test.ts
```

只运行与改动相关且可在本机执行的命令。完整 `pnpm build` 会先通过 `ensureWasm` 检查 Worker 产物，缺失时调用
`build:wasm`；它不属于本路径。任何 Worker、浏览器 Worker 或生成 WASM 产物相关的验证，都必须在具备该工具链的本机或 CI 中
执行。若本地不具备工具链，请在 PR 中列出未运行的 Rust/WASM 验证和已运行命令，交由具备工具链的维护者或 CI 补跑。

## 开发流程

面向外部 Pull Request，请从自己的 fork 开始，而不是向 canonical 仓库直接推送：

1. 在 GitHub 上 fork
   [`allroad88888888/einfach-excel`](https://github.com/allroad88888888/einfach-excel)，然后克隆自己的
   fork 并配置 canonical 仓库为 `upstream`：

   ```bash
   git clone https://github.com/<你的账号>/einfach-excel.git
   cd einfach-excel
   git remote add upstream https://github.com/allroad88888888/einfach-excel.git
   git fetch upstream
   ```

2. 从 canonical 的 `main` 创建特性分支，并安装依赖：

   ```bash
   git switch --create feat/my-feature upstream/main
   pnpm install
   ```

3. 按可用的验证路径执行检查：具备 Rust/WASM 工具链时运行 `pnpm build`、`pnpm test` 和
   `pnpm lint:check`；否则仅运行上一节列出的不依赖 Worker 的定向检查。

4. 需要发版的改动：`pnpm exec changeset`。

5. 提交并推送特性分支：

   ```bash
   git add <改动文件>
   git commit -m "简要说明改动"
   git push --set-upstream origin feat/my-feature
   ```

6. 在 GitHub 创建 Pull Request：base repository 选择
   `allroad88888888/einfach-excel`、base branch 选择 `main`，head repository 选择自己的 fork，head branch
   选择 `feat/my-feature`。PR 描述应列出已运行和未运行的验证；面向 `main` 的 PR 会触发仓库的 CI。

## 项目结构

```
excel/spreadsheet-ui-core/ → @einfach/spreadsheet-ui-core  # 框架无关的表格 UI 核心（atoms / 类型 / 投影契约）
excel/react-excel/         → @einfach/react-excel          # 当前 React 产品与 Vite 演示
excel/solid-excel/         → @einfach/solid-excel          # 已暂停，仅保留源码考古
excel/excel-site/          → @einfach/excel-site           # 已暂停，依赖 Solid 的旧站点
excel/excel-core-ts/       → @einfach/excel-core-ts        # TS 公式引擎（private，parity 参照 + 第二 worker 后端）
excel/rust/core/           → einfach-core (crate)          # Rust atom store
excel/rust/excel-core/     → einfach-excel-core (crate)    # Rust 公式 / 工作簿引擎
excel/rust/wasm/           → einfach-wasm (crate)          # WASM 绑定
```

上游 `@einfach/core` / `@einfach/react` 从 npm 安装，不是 workspace 依赖。架构分层见
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 代码风格

- 无分号，单引号，100 字符行宽（Prettier）
- 严格 TypeScript（`strict: true`、`isolatedModules: true`）
- 禁止 `console` 语句（ESLint）
- 类型导入使用 `type` 关键字
- 每个文件只负责一件事；普通文件 ≤ 300 行，强内聚的算法/状态机核心 ≤ 500 行。改动会顶破上限时，
  拆分就是本次改动的一部分

```bash
pnpm lint:check   # 只检查
pnpm eslint       # 检查并自动修
```

## 文档规则

文档腐坏的根因是「契约」和「某次会话的现场记录」混在同一层，读者无法分辨。本仓因此把文档分成四类，
**每类有不同的生命周期**：

| 类型                 | 是什么                                 | 住哪                                                                      | 生命周期                                                  |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| **契约** (reference) | 描述**现状**，贴着代码放               | `src/<feature>/README.md`、`e2e/<feature>/CASES.md`、`CUSTOM_FORMULAS.md` | 随代码 PR 同步更新                                        |
| **决策** (ADR)       | 一次技术裁决 + 理由                    | `docs/decisions/NNNN-*.md`                                                | 接受后**不改内容**，只能被新 ADR 标记 superseded          |
| **提案** (plan)      | 前瞻计划，文件名带日期                 | `<pkg>/docs/*_YYYY-MM-DD.md`                                              | 落地时：结论上移进契约或 ADR，本体 `git mv` 进 `archive/` |
| **记录** (record)    | handoff / audit / perf 报告 / 协作看板 | `<pkg>/docs/archive/`                                                     | 生成即冻结，直接住归档区                                  |

硬规则：

1. **文件名带日期 = 冻结。** 不要修它的内容，只归档。要更正结论就写新文档。
2. **文档里禁写会腐坏的全局计数。** 不写「本包有 419 个测试」，写出「怎么算」的命令。
   需要登记规模时，用 `CASES.md` 那种「源码路径引用 + 单文件行数」的口径。
3. **归档一律 `git mv`** 以保留历史；并做三件事：加状态横幅（`> ⚠️ 冻结记录（YYYY-MM），
仅供考古，现行契约见 <指针>`）、在 `archive/INDEX.md` 登记一行、**清扫反向引用**
   （源码注释和 CI 里可能有指向该文档的路径）。
4. **改了公共 API、目录结构或后端 port，就要同步对应的契约文档**，与代码在同一个 PR 里。

### 外部反馈的文档回写

外部 issue 或 PR 暴露文档缺口时，不能只在讨论中说明：

1. 在解决该缺口的 PR 中记录来源链接。
2. 若缺口能对应当前行为，在同一个 PR 修正相应的活文档，并列出路径。
3. 在来源 issue 或 PR 回链到该 PR，让反馈者能看到处理结果。
4. 若不能在该 PR 就地修正，写明原因，并在 Issue Tree 新增一个可执行的叶子；在 PR 中记录该叶子。

这两件事有门禁，本地和 CI 跑同一份（pre-commit 也会跑）：

```bash
pnpm check:docs
```

它检查活文档的相对链接是否存在，以及是否出现已知的失效路径形态（拆仓迁出的 `core/*`、
退役的 `excel/showcase`、平铺时代的 `e2e/*.spec.ts`、老仓绝对路径）。`archive/` 豁免 ——
冻结记录里的死链是史实的一部分。讲迁移本身的文档需要引用旧路径时，在文件里写一行
`<!-- doc-check: allow-stale-paths -->` 豁免。

## 版本管理

使用 [Changesets](https://github.com/changesets/changesets)：

```bash
pnpm exec changeset          # 创建变更集
pnpm exec changeset version  # 更新版本号
pnpm exec changeset publish  # 发布到 npm
```

## 测试

```bash
pnpm test                                                   # 全量（不采覆盖率；报告用 pnpm run test:coverage）
pnpm exec vitest run path/to/file.test.ts                    # 单个文件
pnpm --filter @einfach/spreadsheet-ui-core test              # 分区套件
pnpm --filter @einfach/react-excel test
pnpm --filter @einfach/react-excel build
```

## 许可证

MIT
