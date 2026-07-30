## 改了什么

<!-- 一两句说清意图，不用复述 diff -->

## 验证

<!-- 跑了哪些命令、结果如何。贴关键输出，不贴全量日志 -->

- [ ] `npm test`
- [ ] `npm run lint:check`
- [ ] 涉及 e2e：`NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel`

## 文档同步

改了下面任一项，就要在**本 PR 内**同步对应的契约文档：

- [ ] 公共 API / 导出面 → 该包的 `README.md`
- [ ] feature 的 atom 构成、有界缓存上限 → `src/<feature>/README.md`
- [ ] 后端 port（`SpreadsheetBackend`）→ `src/backend/README.md`
- [ ] 目录结构 / 构建管线 → `docs/ARCHITECTURE.md`
- [ ] e2e 场景 → `e2e/<feature>/CASES.md`
- [ ] 做了一次会约束后续选择的技术裁决 → 新增 `docs/decisions/NNNN-*.md`
- [ ] 不涉及以上任何一项

文档规则见 [CONTRIBUTING.md](../CONTRIBUTING.md) §「文档规则」。两条容易踩的：

1. **别在文档里写会腐坏的全局计数**（「本包有 N 个测试」）—— 写出「怎么算」的命令。
2. **文件名带日期的文档是冻结记录**，不要改它的内容；结论变了就写新文档，旧的 `git mv` 进
   `archive/` 并在 `archive/INDEX.md` 登记。
