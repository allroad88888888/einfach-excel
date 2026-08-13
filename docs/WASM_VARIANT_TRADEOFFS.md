# AD-513：WASM lite/full 候选物的功能与体积差异

父节点：[AD-500：可验证的性能证据](adoption-issues/AD-500-performance.md)。本记录比较当前
工作区中刚生成的两个 WASM **候选文件**；测量口径遵循
[AD-511 规程](WASM_SIZE_MEASUREMENT_PROTOCOL.md)。它不是公共包、下载大小、发布物或任何
支持承诺。分发形态和可交付性仍受 AD-100 D2 及其后续叶子约束。

## 本次记录

- `revision`：`6b17a0a10b8d280431799bd1a8cfea73700c59e8`
- `worktree`：采集时非干净；`git status --short` 输出为
  ` M docs/ADOPTION_ISSUE_TREE.md`。该未提交改动不在本记录的写集内。
- `captured_at_utc`：`2026-08-13T10:39:08Z`
- `tool_versions`：Node `v24.14.0`、npm `11.9.0`、wasm-pack `0.14.0`、Apple gzip
  `479`、`Darwin 25.5.0 arm64`。

| mode | build command（仓库根目录）                       | candidate path                                         | raw bytes | gzip bytes |
| ---- | ------------------------------------------------- | ------------------------------------------------------ | --------: | ---------: |
| lite | `npm run build:wasm -w @einfach/solid-excel`      | `excel/solid-excel/wasm-pkg/einfach_wasm_bg.wasm`      | 1,892,911 |    613,545 |
| full | `npm run build:wasm:full -w @einfach/solid-excel` | `excel/solid-excel/wasm-pkg-full/einfach_wasm_bg.wasm` | 2,831,449 |    927,852 |

两行均先由 `npm run build:wasm:both -w @einfach/solid-excel` 在本次记录的修订上重新生成，
然后逐个候选文件以规程命令测量：

```bash
set -o pipefail
candidate='excel/solid-excel/wasm-pkg/einfach_wasm_bg.wasm' # full 时替换路径
test -f "$candidate"
raw_bytes=$(wc -c < "$candidate" | tr -d '[:space:]')
gzip_bytes=$(gzip -n -9 -c "$candidate" | wc -c | tr -d '[:space:]')
echo "raw_bytes=$raw_bytes"
echo "gzip_bytes=$gzip_bytes"
```

在这个修订、构建输入和 gzip 实现下，full 相比 lite 多 `938,538` raw 字节（`49.58%`）与
`314,307` gzip 字节（`51.23%`）。这是同一次、单文件候选测量的差值，不外推为加载时间、
网络传输量、包大小或面向用户的性能结论。

## 功能选择与构建图

lite 的 `einfach-wasm` 依赖关闭 `einfach-excel-core` 的默认 feature；full 显式开启
`regex-formulas`。因此下列公式功能是本次候选物的明确取舍：

| mode | `REGEXTEST` / `REGEXEXTRACT` / `REGEXREPLACE` |
| ---- | --------------------------------------------- |
| lite | 不注册为内建函数，求值为 `#NAME?`。           |
| full | 启用 `regex-formulas`，提供这三个内建函数。   |

该差异由以下本地验证覆盖：

```bash
cargo test --manifest-path excel/rust/excel-core/Cargo.toml \
  --no-default-features --lib regex_builtins_degrade_to_name_error_without_the_feature
cargo test --manifest-path excel/rust/excel-core/Cargo.toml --lib eval_regextest_happy
```

两条命令均通过。它们只证明上述正则公式差异，不能推导其他公式、运行时行为或宿主集成的
全量等价性。

变体是入口的静态构建图选择：`worker-runtime.ts` 静态导入 lite 路径，
`worker-runtime-full.ts` 静态导入 full 路径。此事实不定义任何公开入口、默认分发方案或
切换承诺；宿主是否采用任一候选物仍需在 AD-100 D2 之后由相应交付工作验收。

## 重新采集条件

源码修订、构建命令、候选路径、strip 过程、gzip 实现或版本任一变化时，必须按 AD-511
重新构建并建立新记录；不得将这里的字节数同其他记录拼接或替换。若需要对外披露任何体积
或性能说法，还必须满足相关公开证据与发布门禁，不能以本文件替代。
