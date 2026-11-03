# 单元格存储与读取优化验证（2026-11-03）

基线：`07cfd856`，原生 aarch64 macOS，rustc 1.95.0，release。
记录范围为读取优化 1～5；Store 仍是 HashMap，公式记录未合并。

## 最终实现

- 文本使用 `Arc<str>`，保留 `Value` 的 Send/Sync 与内容相等语义；JS 与文件格式仍为字符串。
- 两处 Plain 判空只借用值；Store 先比较再移动旧值，首次提交后释放 init。
- 范围公式地址缓冲按实际结果增长，不按整表公式数预留。
- 不超过 4096 个坐标的视口携带槽位快照，省去重新查找；更大区域保持地址快照，限制峰值内存。
- 大范围的 Plain 成员直接依赖地址 epoch，不创建 facade。已经物化的 atom、公式与 spill 仍用 facade。
- Plain 升级为 atom 时通知 epoch，公式移除时回收独立 epoch；既有 Store 图继续负责跨表传播、循环和订阅。

与初始计划的两处调整：直接读取已物化 atom 会让每个成员记录 epoch 和值两条边，增加重算工作，因此保留其 facade；大区域的值快照会扩大临时缓冲，因此只在有界视口使用。

## 分配与节点计数

由独立进程内的 CountingAllocator 记录申请字节和仍存活字节；不等于 RSS，也不包含分配器内部碎片。
输入和工作簿安装位于读取测量区间之外。下面不是浏览器内存数据。

| 场景 | 修改前 | 修改后 |
|---|---:|---:|
| 读取 10000 个 128 B 文本值 | 10000 次分配 / 1280000 B | 0 次 / 0 B |
| 只枚举上述地址 | 10013 次分配 | 13 次（地址缓冲） |
| 范围外有 100000 个公式，读空白 A1 | 800000 B 临时申请 | 0 B |
| Plain 安装 100000 数字，首次 SUM 后 atom 数 | 200394 | 100394 |
| 同一次 SUM 新增存活堆分配 | 144399295 B | 63100359 B |
| 覆盖含 1 MB 初始文本的 atom 后保留的旧文本 | 1000000 B | 0 B |
| 本机 Value / Option<Value> 尺寸 | 24 / 24 B | 24 / 24 B |

逐格批量加载与整表直接安装分别测量：前者数字已经是 atom，保留其 facade，首次 SUM 后仍为 300394 个 atom；不能把 Plain 场景的减半收益套用到这一入口。

## 时间测量边界

新增 Criterion 基准覆盖文本 8/128/4096 B 的读取、地址枚举和视口，SUM 首次/缓存/编辑重算，以及 10 万公式安装/首次窗口/编辑窗口/空窗口。首次和编辑用例断言计算计数或结果，缓存用例断言计数不变。使用 iter_batched_ref 排除准备和析构。

本次 quick 对比在机器存在并行构建及其他任务时运行，连未改变路径的缓存读时间也有大幅波动；不将这些 wall-clock 百分比作为稳定提速结论。确定性结论以分配与 atom 计数为准。发布性能结论前应在空闲机器运行完整采样。

真实 Chromium Worker 探针分别加载 lite/full，安装 100×100 文本格，读取 50×27 视口，断言全部 1350 个显示文本和编辑文本正确。跳过 5 次预热，记录 30 次测量的 WASM 读取和包含 structured clone 的往返中位数；最终读出中位数 lite/full 均约 2.1 ms，往返分别约 2.6 / 2.7 ms。它只测修改后的绝对时间，没有浏览器修改前基线。

## 验证

- Store：66 个测试通过，包括共享文本和初始化值释放。
- excel-core 默认功能集：3796 个测试通过；lite：3756 个测试通过。
- 最终快速路径收窄和视口缓冲限制后，复跑 direct_range_members、range_materialization_order、lazy_bulk_load、manual_calculation，39 项通过；随后增加快照分支等价测试，direct_range_members 的 6 项全部通过。
- WASM 原生：218 个测试通过；lite/full 均重新构建。
- UI Core：4 个相关测试文件、30 个测试通过。
- Chromium 真实 Worker 页面：28 个用例通过（手动计算、spill 操作、选区统计、首次投影导航）。
- 标准 E2E 包装命令的 package:prepare 被现有 UI 包产物问题阻断：React 包引用的 readOnlySheetIdsAtom 未从 UI Core 的 esm/index.mjs 导出。上述页面验收使用只启动源码 Vite 的临时配置，未声称通过打包消费者验收。

## 复现

```sh
cargo run --release --manifest-path excel/rust/excel-core/Cargo.toml --example storage_allocations
cargo bench --manifest-path excel/rust/excel-core/Cargo.toml --bench storage_reads -- --save-baseline before
# 应用优化后，在同一空闲机器比较：
cargo bench --manifest-path excel/rust/excel-core/Cargo.toml --bench storage_reads -- --baseline before
# 启动 React Vite dev server 后运行（默认端口 5191）：
node scripts/bench-rust-storage-worker.mjs http://127.0.0.1:5191
```

视口携带值会增加单条快照尺寸，因此设有 4096 坐标上限。Arc 不是字符串驻留池，独立创建的相同文本不会自动去重。许多未复用的短文本可能有引用计数头开销，不承诺所有工作簿的安装内存下降。

文件组织：新增源文件均小于 300 行。Store 和部分公式/测试文件本来已超过行数上限，本轮只作必要的局部修改或文本类型迁移，未扩大为结构重构。
