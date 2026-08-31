# 012 R2 最终覆盖审计报告

## 结论与四态

- 回执：`DONE`。C-001～C-018 全部为 `✅/N/A`，没有 `❌`。
- 实现：`N/A`。本叶只审计，没有修改产品、任务定义或 index。
- 验证：`DONE`。R2 轻量强门、新旧两类 stale-path 扫描与 35 目标存在性门均通过；R1 的 build/E2E/package/consumer 重型证据仍有效。
- 范围：`DONE`。只更新本报告；没有 commit、没有派生 agent。
- 风险：`NON_BLOCKING_ONLY`。只剩任务树既有的存量/历史 triage，不构成 cutover 阻断。

基线为 `git rev-parse HEAD` → `723082739d66140ac697a5a9c203a6fd99649d4a`；审计对象是 001～023 共用的当前未提交工作树。012 R1 的独立审查因旧 `src` 悬空路径判为 `REJECTED`；023 R1 修复后已获独立 `APPROVED`。**012 可以结束，`solid-excel-source-cutover` 任务树可以关闭。**

## 强制验收命令

| 命令 | R2 结果 |
|---|---|
| `npm run check:docs` | ✅ R2 exit 0；352 份活文档零死链，2837 份文件无失效路径。 |
| `npm run lint:check` | ✅ exit 0；零 ESLint error。 |
| `npm run check:cycles` | ✅ 复用 R1：exit 0；1052 modules、2504 dependencies、零 violation。 |
| `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` | ✅ exit 0；零诊断。 |
| `git diff --check` | ✅ R2 exit 0；零 whitespace error。 |
| `npm run build:publish` | ✅ 复用 R1：exit 0；core、UI-core、Solid composite build/Rollup 全部成功；Solid 输入含 legacy、current root/public/demos/i18n、worker factory/runtime/full/core/TS entry。 |
| `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts e2e/demos/demo-budget.spec.ts e2e/worker-backend/vnext-worker-backend.spec.ts --project=wasm` | ✅ 复用 R1：34/34，legacy budget 7、current smoke 19、WASM worker 8。 |
| `git grep -n 'src-vnext'` | ✅ grep 本身 exit 0；205 行、47 文件。下方精确分类为 archive 37 + 历史 allowlist 10 + unexpected 0。 |
| `find excel/solid-excel/src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -print0 \| xargs -0 wc -l` | ✅ 复用 R1：553 文件、55666 行；023 的两个 `src` 文件只改注释，其中 `worker-entry-ts.ts` 注释增加 1 行，普通文件无未登记超限。 |

## C-001～C-018 覆盖矩阵

| ID | 状态 | 精确命令与证据 |
|---|---|---|
| C-001 现役源码主线 | ✅ | `test ! -d excel/solid-excel/src-vnext; test -f excel/solid-excel/src/public.ts; test -f excel/solid-excel/src/index.ts` 全部 exit 0；Solid `tsc --noEmit` exit 0。 |
| C-002 legacy 兼容树 | ✅ | `test -f excel/solid-excel/legacy/index.tsx` exit 0；`npx jest excel/solid-excel/test/Cell.test.tsx excel/solid-excel/test/Table.test.tsx excel/solid-excel/test/sheet-store.test.ts excel/solid-excel/test/wasm-workbook-proxy.test.ts --runInBand` → 4/4 suites、104/104 tests；package-entry 另断言 `legacy.Table` 存在而 root 不泄露 `Table`。 |
| C-003 默认本地 Demo | ✅ | 指定 WASM 命令中的 `e2e/smoke/vnext-smoke.spec.ts` → 19/19，覆盖默认 Wave 5、虚拟 grid、编辑、tabs、菜单、resize 与 clipboard current 表面。 |
| C-004 legacy parity Demo | ✅ | 同一命令中的 `e2e/demos/demo-budget.spec.ts` → 7/7，含 `legacy navigation overrides conflicting route flags`；legacy Jest 104/104。 |
| C-005 公共性能基准 | ✅ | `npx jest excel/solid-excel/test/bench-registry.test.ts --runInBand` → 1/1 suite、2/2 tests，真实 registry 的 3 个 ID/category/data scale/metadata/run/lookup/unknown 均受约束；`NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/bench/bench-smoke.spec.ts --project=wasm` → 1/1，`/?bench=1` 显示 stage、三张 scenario card、可用 Run 按钮且无 console error。 |
| C-006 包根与 `/vnext` | ✅ | `npx jest excel/solid-excel/test/package-entry.test.ts excel/solid-excel/test/package-vnext-subpath.test.ts excel/solid-excel/test/package-css-side-effects.test.ts --runInBand` → 3/3 suites、7/7；root 指 `src/index`，`/vnext` 指同一 current public API，root 不含 legacy/demo/factory。 |
| C-007 worker 子路径 | ✅ | 同一 7-test contract 对 `/worker-{factory,runtime,runtime-full,runtime-core}` 与四条 `/vnext-worker-*` 兼容别名逐对象 `toEqual`；R1 tarball 中 source、types、ESM 三类 worker-factory 均存在。 |
| C-008 样式子路径 | ✅ | 同一 `package-css-side-effects.test.ts` 对 `/styles.css` 与 `/vnext-styles.css` 分别完成 production tree-shaken Vite build；`node -e 'const p=require("./excel/solid-excel/package.json"); console.log(JSON.stringify({exports:p.exports,files:p.files,sideEffects:p.sideEffects},null,2))'` 显示两者均指 `./src/styles/index.css` 且 CSS 在 `sideEffects`。 |
| C-009 demos 与 i18n 子路径 | ✅ | 同一 `package-entry.test.ts` 断言 `solid/types/import/default` 均指 current `src/demos`、`src/i18n` 并实际加载 i18n；R1 tarball 含对应 source/ESM/types。 |
| C-010 官网消费者 | ✅ | `npm run typecheck -w @einfach/excel-site; npm run check:docs -w @einfach/excel-site; npm run build -w @einfach/excel-site` 均 exit 0，42 pages；旧入口扫描 `rg -n 'src-vnext\|@einfach/solid-excel/vnext(-worker-(factory\|runtime\|runtime-full\|runtime-core))?\|@einfach/solid-excel/vnext-styles\.css' excel/excel-site/src excel/excel-site/astro.config.mjs excel/excel-site/vite.config.ts` → exit 1、零匹配。 |
| C-011 starter 消费者 | ✅ | 当前 `main.tsx` 与首轮隔离副本 `diff -u` 零差异；`npm --prefix /tmp/solid-cutover-starter.uttGdh install /tmp/solid-cutover-r1-pack.8NO1DK/einfach-solid-excel-0.1.0.tgz /tmp/solid-cutover-r1-styles-pack.USdMaV/einfach-spreadsheet-ui-styles-0.1.0.tgz` 后 `npm --prefix /tmp/solid-cutover-starter.uttGdh run build` → exit 0、886 modules，输出 WASM、WASM worker、TS worker、CSS 与 app chunk。源码使用 root、`/worker-factory`、`/styles.css`。 |
| C-012 单测与深层内部导入 | ✅ | `git grep -n 'src-vnext' -- package.json rules .dependency-cruiser.cjs excel/solid-excel/test excel/solid-excel/e2e excel/solid-excel/demo-remote` → exit 1；下方旧路径 PCRE 对 023 的 9 个现行文件同样 exit 1、零残留，35 个替代目标 `count=35 missing=0`。package contract 7/7 与 legacy 104/104 的 R1 证据继续成立。 |
| C-013 双后端浏览器/worker 路径 | ✅ | 指定 WASM E2E 34/34 证明 current、legacy、WASM-worker 三表面；`npx jest excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts excel/solid-excel/test/vnext-worker-undo-ts.test.ts excel/solid-excel/test/vnext-worker-runtime-resources.test.ts excel/solid-excel/test/vnext-top-bottom-projection.test.ts --runInBand` → 4/4 suites、35/35，补足 TS-worker runtime parity。 |
| C-014 构建与发布产物 | ✅ | `npm run build:publish` exit 0；`pnpm --filter @einfach/solid-excel pack --pack-destination /tmp/solid-cutover-r1-pack.8NO1DK` → 2848 项。`tar -tzf ...` probe → `required_missing=0`、`src_vnext_entries=0`、`top_level_dev_entries=0`；分类为 src 555、legacy 36、esm/src 480、esm/legacy 13、types/src 1653、types/legacy 108。 |
| C-015 lint/cycle/type 工具 | ✅ | R2 `npm run lint:check` 与 `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` exit 0；复用 R1 `npm run check:cycles` 的 1052 modules/2504 dependencies/零 violation，且 cycle 覆盖 canonical `excel/solid-excel/src`。 |
| C-016 现行架构文档 | ✅ | `git grep -n 'src-vnext' \| wc -l` → 205；`git grep -l 'src-vnext' \| wc -l` → 47；allowlist 分类为 archive 37、historical 10、unexpected 0。另以 reviewer 列出的旧 `src/App/Table/sheet-store/demos/LocaleSwitcher/styles/wasm-worker/proxy` 完整谓词扫描 9 个现行文件 → exit 1、零残留；35 个新职责目标全部存在且关键职责抽查一致。R2 `check:docs` 为 352/2837。 |
| C-017 历史文档 | N/A | 同一全局 grep/allowlist 分类证明全部 47 文件只有 37 个 `/archive/` 与 10 个 index 明示历史记录/ADR/audit snapshot；按裁决保留原文，不是产品路径。 |
| C-018 文件职责与行数 | ✅ | 复用 R1 精确 `find ... -print0 \| xargs -0 wc -l` → 553 文件/55666 行；`... \| awk '$1 > 300'` 仅有登记复杂例外 `wasm-workbook-surface.ts` 303（协议面）、`renderRangeAsImage.ts` 399（图片算法）、`sheet-tab-controller.ts` 343（交互状态机）及 i18n 资源豁免 `en.ts` 924、`zh.ts` 883。023 两个 `src` 文件只改注释，其中 `worker-entry-ts.ts` 注释增加 1 行；其余 548 文件 ≤300。 |

## C-016 精确 allowlist 分类

执行：

```sh
git grep -l 'src-vnext' | awk '
BEGIN {
  allow["docs/AD142_FAILURE_PATH_WALKTHROUGH.md"]=1
  allow["docs/PARITY_BACKLOG_HANDOFF_2026-08-04.md"]=1
  allow["docs/adoption-issues/AD-100-publish-pipeline.md"]=1
  allow["docs/decisions/0004-worker-factory-out-of-barrel.md"]=1
  allow["docs/decisions/0005-e2e-feature-folders.md"]=1
  allow["docs/decisions/0006-spill-region-write-semantics.md"]=1
  allow["docs/decisions/0015-wasm-distribution-single-package.md"]=1
  allow["docs/interaction-execution/AD-311-solid-coupling-audit-tsx.md"]=1
  allow["docs/interaction-execution/AD-311-solid-coupling-audit.md"]=1
  allow["excel/solid-excel/docs/REMOTE_RESTART_PLAN_2026-07-28.md"]=1
}
/\/archive\// { archive++; next }
allow[$0] { historical++; next }
{ unexpected++; print "UNEXPECTED " $0 }
END {
  print "archive=" archive
  print "historical_allowlist=" historical
  print "unexpected=" unexpected + 0
}'
```

结果为 `archive=37`、`historical_allowlist=10`、`unexpected=0`。这精确关闭 F-012-1，且没有通过扩大 allowlist 隐藏现行文件。

## R2 旧 `src` 迁移残留与新目标核验

012 R1 reviewer 列出的旧路径谓词不等同于 `src-vnext`，因此另行执行：

```sh
rg --pcre2 -n '(?:src-vnext|(?:excel/solid-excel/)?src/(?:App\.tsx|Table\.tsx|sheet-store\.ts|LocaleSwitcher\.tsx|styles\.css|wasm-workbook-(?:proxy|worker)\.ts|demos/Demo(?:Budget|Grades|Sales|Million|Large)\.tsx))' \
  excel/solid-excel/e2e/clipboard/CASES.md \
  excel/solid-excel/e2e/demos/CASES.md \
  excel/solid-excel/e2e/i18n-a11y/CASES.md \
  excel/solid-excel/e2e/perf-virtual/CASES.md \
  excel/solid-excel/e2e/smoke/CASES.md \
  excel/solid-excel/e2e/worker-backend/CASES.md \
  excel/solid-excel/e2e/format/toolbar-colors.spec.ts \
  excel/solid-excel/src/adapter/worker/limits.ts \
  excel/solid-excel/src/adapter/worker-entry-ts.ts
```

结果为 exit 1、零匹配：原 `src-vnext` 与旧 App/Table/store/demo/locale/styles/WASM worker/proxy 路径在这 9 个现行文件中全部归零。

随后执行 023 的精确目标清单：

```zsh
target_refs=(
  excel/spreadsheet-ui-core/src/{clipboard,paste-special,selection,viewport}
  excel/spreadsheet-ui-core/src/backend/types.ts
  excel/solid-excel/src/grid/grid-clipboard.ts
  excel/solid-excel/src/{paste-special,i18n,find-replace,format-cells,go-to,named-ranges,demos}
  excel/solid-excel/src/format-cells/format-cells-dialog-focus.ts
  excel/solid-excel/src/provider/SpreadsheetUiProvider.tsx
  excel/solid-excel/src/adapter/{worker-workbook-backend.ts,worker-runtime.ts,worker-runtime-ts.ts,worker-protocol.ts,worker-factory.ts,worker-entry-ts.ts}
  excel/solid-excel/demo/{App.tsx,LocaleSwitcher.tsx}
  excel/solid-excel/legacy/{Table.tsx,sheet-store.ts,wasm-workbook-proxy.ts}
  excel/solid-excel/legacy/demos/{DemoBudget.tsx,DemoGrades.tsx,DemoSales.tsx,DemoMillion.tsx,DemoLarge.tsx}
  excel/spreadsheet-ui-styles/styles/grid-overlays.css
  excel/rust/wasm/src/lib.rs
  excel/rust/excel-core/src/{workbook.rs,auto_fill.rs}
)
missing=0
for target_ref in "${target_refs[@]}"; do
  if ! test -e "$target_ref"; then
    print -r -- "MISSING $target_ref"
    missing=$((missing + 1))
  fi
done
print -r -- "PATH_EXISTENCE_OK count=${#target_refs[@]} missing=$missing"
test "$missing" -eq 0
```

结果为 `PATH_EXISTENCE_OK count=35 missing=0`。职责抽查 `rg -n 'copySelectionToClipboard|pasteFromClipboard|installGridClipboard' ...`、`rg -n 'worker-runtime\.ts|worker-entry-ts\.ts|worker-runtime-ts' ...`、`rg -n 'background-color: inherit|STRUCTURAL_SNAPSHOT_MAX' ...` 进一步确认：clipboard 两函数位于 `grid-clipboard.ts:82,170`，`SpreadsheetGrid.tsx` 只 import/install；factory 分别 spawn WASM `worker-runtime.ts` 与 TS `worker-entry-ts.ts`，TS 壳委托 `worker-runtime-ts.ts`；CSS inherit 规则及 legacy 2000-cell precedent 均在所述目标内。

023 的 9 文件为 18～213 行。六个 CASES 是 ledger，`toolbar-colors.spec.ts` 只改一行 `//` 路径，`limits.ts` 与 `worker-entry-ts.ts` 只修正文档注释；023 R1 独立 review 已确认无断言、执行逻辑、常量或入口 wiring 变化并给出 `APPROVED`。因此 R2 复跑 docs/tsc/lint/diff/path 门即可；R1 的 build、34 条 E2E、package 7/7、legacy 104/104、TS-worker 35/35、tarball、site 与 starter 重型结果不受本轮行为无关改动影响，予以复用。

## 发现项关闭与非阻断 triage

- ✅ F-012-1 已由 021 R1 关闭：原 9 文件/15 处现行 `src-vnext` 残留归零；ARCHITECTURE 的 TS worker 描述已由独立复审确认指向 `worker-runtime-ts.ts` 与 `@einfach/excel-core-ts`。
- ✅ F-012-2 已由 022 关闭：非同义反复的 registry Jest 2/2 与真实 `/?bench=1` WASM smoke 1/1 均在当前树复跑通过。
- ✅ F-012-3 已由 023 R1 关闭：012 R1 reviewer 的旧 `src` 悬空路径 Important 已用 9 文件零残留扫描、35 目标存在性与职责抽查复核；023 首审的 clipboard composition-root Important 和 a11y 行数 Minor 也已修复，独立复审为 `APPROVED`。
- ✅ 前序 004～011、013～020 报告/review 中的阻断发现均已关闭；没有仍为 Critical/Important 的 cutover 漏项。
- ℹ️ 既有非阻断 triage 仍保留：`static-formula/functions.ts` 格式、2958 行存量测试、009 的低级注释/缩进、legacy 超限债务、日期化历史文档与路过的 `numberFormat.ts` 338 行。这些均不改变 C 行验收。

## 审计夹具失败归因

首次 R1 starter 增量 probe 只安装 Solid tarball 后，Vite 因 registry 中同版本 styles 包缺少 `features/print-preview-dialog.css` 而失败；这是未同时安装当前 workspace styles tarball 的夹具错误。随后用上表精确命令同时安装本轮 Solid 与 styles tarball，886-module production build exit 0。该失败未修改仓库，也不构成产品/消费者失败。

## 可关闭性裁决

**所有 C 行均为 `✅/N/A`；F-012-1、F-012-2、F-012-3 均已关闭；012 与整棵 `solid-excel-source-cutover` 任务树可以关闭。**
