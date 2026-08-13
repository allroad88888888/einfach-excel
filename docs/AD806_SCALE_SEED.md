# AD-806：千万级已填充格种子 TSV

父节点：[AD-800 规模能力与技术差异化](adoption-issues/AD-800-scale-differentiation.md)。

这个脚本只生成可重复的测试输入，不测量加载、内存、DOM、订阅数或交互表现；这些观察属于后续叶子。

## 固定格式

- 默认尺寸为 10,000 行 × 1,000 列，即 10,000,000 个非空单元格。
- 输出是 UTF-8 TSV：单元格以制表符分隔，每个数据行以换行符结束。
- 零基坐标 `(row, column)` 的值固定为 `r{row}c{column}`。例如 2 行 × 3 列的输出为：

  ```tsv
  r0c0	r0c1	r0c2
  r1c0	r1c1	r1c2
  ```

生成器逐行写入标准输出，不在内存中构造整个 TSV。生成的文件是本地测试输入，不能提交到仓库。

## 生成

默认的千万格种子：

```sh
node scripts/generate-ad806-filled-tsv.mjs > /tmp/ad806-filled-10000x1000.tsv
```

可用小尺寸复现格式或编写消费者测试：

```sh
node scripts/generate-ad806-filled-tsv.mjs --rows 2 --columns 3 > /tmp/ad806-sample.tsv
```

`--rows` 与 `--columns` 都要求正的安全整数；未指定时分别为 10,000 和 1,000。

## 验证

```sh
node --test scripts/generate-ad806-filled-tsv.test.mjs
npm run check:docs
```

测试通过 CLI 小尺寸参数检查确定性、每格非空的示例输出和非法维度拒绝行为；它不会生成默认的千万格文件。
