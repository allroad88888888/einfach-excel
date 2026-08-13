# AD-509：基准数据规模档位

父节点：[AD-500 可验证的性能证据](adoption-issues/AD-500-performance.md)。

本交付只固定基准场景可引用的确定性输入档位；它不运行基准，也不产生加载、内存、
滚动、重算或交互的结论。

## 档位定义

每个档位同时定义网格和公式链两种输入形状。网格以零基坐标值
`r{row}c{column}` 填满；公式链第一行是 `1`，每个后续行引用前一行，例如第二行
为 `=A1+1`。所有行以 UTF-8 TSV 输出，公式仍由实际被测的导入或工作簿装载路径解释。

| 档位 ID  |  网格行 × 列 | 网格非空单元格 | 公式链行数 |
| -------- | -----------: | -------------: | ---------: |
| `smoke`  |      10 × 10 |            100 |         10 |
| `small`  |     100 × 20 |          2,000 |        100 |
| `medium` |   1,000 × 50 |         50,000 |      1,000 |
| `large`  | 10,000 × 100 |      1,000,000 |     10,000 |

档位 ID、形状和生成器修订应作为运行环境记录中的 `dataScaleId` 与
`dataDefinition` 的可识别引用；环境记录的字段格式仍以
[ADR 0011](decisions/0011-public-performance-environment-record.md) 为准。

## 生成

生成器默认只输出 `smoke` 网格，避免无参数命令创建大输入。它逐行写到标准输出，
不在内存中聚集完整的 TSV。`large` 必须显式指定，生成出的本地文件不可提交到仓库。

```sh
# 默认：10 × 10 的 smoke 网格
node scripts/generate-ad509-benchmark-fixtures.mjs > /tmp/ad509-smoke-grid.tsv

# 显式选择一份中等网格输入
node scripts/generate-ad509-benchmark-fixtures.mjs --tier medium --shape grid > /tmp/ad509-medium-grid.tsv

# 显式选择一份 large 公式依赖链输入
node scripts/generate-ad509-benchmark-fixtures.mjs --tier large --shape formula-chain > /tmp/ad509-large-chain.tsv

# 检查固定定义而不输出夹具
node scripts/generate-ad509-benchmark-fixtures.mjs --list
```

`--tier` 只能取 `smoke`、`small`、`medium` 或 `large`；`--shape` 只能取 `grid` 或
`formula-chain`。同一参数总是得到相同的字节序列。

## 验证边界

```sh
node --test scripts/generate-ad509-benchmark-fixtures.test.mjs
npm run check:docs
```

测试覆盖默认小夹具、选定形状的确定性、`small` 网格尺寸与非法档位拒绝。档位是
测量输入，不是容量声明、性能目标或跨产品比较；测量样本与统计口径仍由
[ADR 0009](decisions/0009-public-performance-measurement-methodology.md) 规定。
