# AD-511：WASM 候选物体积测量规程

本规程定义现有 WASM 构建候选文件的 raw 与 gzip 字节记录方式。它只规定
测量边界与记录格式，不产生数值、比较、性能结论或对外支持承诺。

## 交付边界

这里的文件是当前工作区的构建候选物，不是公共产物，也不是可安装或可交付
的包内容。WASM 的分发形态、支持承诺与离体打包验证仍由 AD-100 的 D2 及其
后续叶子决定；在它们完成前，不得把本规程记录的路径或字节数表述为包大小、
下载大小或用户可获得的产物。

每条记录只描述一个 `.wasm` 文件。不得把 glue、UI、worker、多个变体或任何
其他文件相加后记作同一个候选物。

## 候选文件

从仓库根目录以当前标准构建生成候选物。标准脚本会在 `wasm-pack` 后执行
名称段剥离；测量对象是剥离后的文件，而不是 `*:keep-names` 调试构建。

| mode | 生成命令                                          | 候选文件                                               |
| ---- | ------------------------------------------------- | ------------------------------------------------------ |
| lite | `npm run build:wasm -w @einfach/solid-excel`      | `excel/solid-excel/wasm-pkg/einfach_wasm_bg.wasm`      |
| full | `npm run build:wasm:full -w @einfach/solid-excel` | `excel/solid-excel/wasm-pkg-full/einfach_wasm_bg.wasm` |

不要以目录是否已存在替代对应生成命令。每次记录先执行表中该 mode 的命令，再对
该命令刚生成的精确路径采集。

## 采集方法

对每个 mode 分别运行下面命令；将 `candidate` 替换为表中的精确候选路径。命令
以 `set -o pipefail` 使 gzip 失败不会被管道末端的 `wc` 掩盖。

```bash
set -o pipefail
candidate='excel/solid-excel/wasm-pkg/einfach_wasm_bg.wasm'
test -f "$candidate"
raw_bytes=$(wc -c < "$candidate" | tr -d '[:space:]')
gzip_bytes=$(gzip -n -9 -c "$candidate" | wc -c | tr -d '[:space:]')
echo "raw_bytes=$raw_bytes"
echo "gzip_bytes=$gzip_bytes"
```

`wc -c` 的输入仅为候选文件，因此 raw 是该文件的字节数。gzip 使用 `-n` 排除
原始文件名与时间戳，并以 `-9 -c` 对同一字节流压缩且不改写候选文件；这样可在
相同 gzip 实现与版本下复现 gzip 字节数。不得改用带时间戳或文件名的 gzip 输出，
也不得以压缩后的磁盘文件长度替代管道输出的字节数。

## 必填记录

每个候选物的测量记录必须同行或同一可审查文件中包含：

- `revision`：构建前 `git rev-parse HEAD` 的完整提交号，以及工作树是否干净；
- `mode`：`lite` 或 `full`；
- `path`：表中未归一化、未改名的相对候选路径；
- `build_command`：实际执行的表中生成命令，包含工作目录；
- `measurement_command`：实际的 raw 与 gzip 采集命令，包含 `gzip -n -9 -c`；
- `raw_bytes` 与 `gzip_bytes`：该次命令标准输出的原始整数；
- `captured_at_utc`：采集完成时的 UTC 时间戳；
- `tool_versions`：`node --version`、`npm --version`、`wasm-pack --version` 与 gzip
  版本输出；以及运行命令时使用的操作系统与架构。

可用下列只读命令采集上述环境字段；保留其原样输出，不从别次运行补填：

```bash
git rev-parse HEAD
git status --short
date -u +%Y-%m-%dT%H:%M:%SZ
node --version
npm --version
wasm-pack --version
gzip --version 2>&1 || gzip -V 2>&1
uname -srm
```

构建命令、候选路径、压缩参数、修订或 gzip 实现任一项变化时，创建新的记录，
不与旧记录合并、替换或推导比较结论。
