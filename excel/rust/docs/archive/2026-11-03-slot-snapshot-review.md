# 稀疏扫描快照预算复核（2026-11-03）

本记录补充同日的 [存储优化记录](2026-11-03-storage-read-optimization.md)。
基线为复核前工作区版本：超过 4096 坐标的区域全部使用地址快照。
测量环境为 aarch64 macOS、rustc 1.95.0、release；不包含安装工作簿的成本。

## 实现边界

- 同一趟稀疏遍历携带前 8192 个实际 primitive 槽位，其余仅保存地址。
  这是实际槽位预算，不是矩形面积限制；空坐标不消耗预算。
- 8192 是覆盖 100×50 密集视口的二次幂容量。当前原生地址加槽位记录
  为 32 B，对应最多 256 KiB 槽位缓冲；不把此布局当成跨平台保证。
- 公式地址仍独立快照，随后按行主序归并；Store 读取及回调前释放借用。
- 区域大小判断在成员循环外计算。Plain 的逐地址 epoch 继续按需创建、复用，
  本次未改变区域失效传播、Store 容器或公式记录结构。

## 基准修正

原生 viewport 基准原来只安装一列，50×27 窗口只读到 50 个文本格。
现在安装 100×100 文本格，验证 50×27 窗口读到 1350 格、100×50 窗口
读到 5000 格；补充百万行范围中的 5000 个实际格子，以及 10 万格导出。
每组基准在计时前断言实际访问数量。Worker 探针覆盖普通、宽、稀疏视口和
跨预算导出，逐个校验显示文本与编辑文本。

## 分配测量

`storage_allocations` 的全局分配器记录申请字节；以下不是 RSS，也不包含
分配器元数据。两个版本用相同数据和同一探针单独运行。

| 场景 | 修改前峰值增量 | 修改后峰值增量 | 修改后结束时保留增量 |
|---|---:|---:|---:|
| 密集 100×50，5000 个文本格 | 65536 B | 262144 B | 0 B |
| 百万行范围中的 5000 个文本格 | 65536 B | 262144 B | 0 B |
| 导出 100000 个文本格 | 1048576 B | 1310720 B | 0 B |

更宽的视口用额外临时内存省去重复查找；大导出的新增槽位缓冲有上限，
并不随总格子数持续增长。文本内容仍共享，未恢复逐格字符串分配。
Criterion quick 已跑同场景前后对比，但修改后测量期间有构建活动，
不据此给出稳定提速比例；空闲机器应使用完整采样重测。

## 验证

- 默认版库内测试 1680 项通过、3 项原有忽略；默认版及 lite 的定向测试
  各 58 项通过，覆盖直接区域成员、归并顺序、懒加载、手动计算及空格语义。
- 新增场景覆盖 100×50 密集文本、百万行稀疏矩形，以及实际成员数在
  8191、8192、8193、10000 时的文本、atom 与懒公式混合读取。
- lite/full WASM 已重新构建，真实 Chromium Worker 的四种形状均通过。
  每种先预热 5 次，再校验并测量 30 次，未把绝对时间当作前后提速证据。
- `check:docs`、JavaScript 语法检查及 `git diff --check` 通过。
- 新增测试、探针与本轮扫描文件均不超过 300 行。现有公式 provider 为
  361 行，本次只增加一次循环外判断，未扩大为拆分重构。

## 复现

```sh
cargo run --release --manifest-path excel/rust/excel-core/Cargo.toml --example storage_allocations
cargo bench --manifest-path excel/rust/excel-core/Cargo.toml --bench storage_reads -- 'storage/(text/(wide_viewport|sparse_wide_viewport)/false/128|export100k)' --save-baseline before-slot-budget
# 修改后使用 --baseline before-slot-budget
node scripts/bench-rust-storage-worker.mjs http://127.0.0.1:5297
```
