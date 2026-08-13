# 稀疏单元格存储模型

本契约说明 Rust `Sheet` 如何用 `RowMajorMap` 表示已存储的单元格地址，以及
范围读取如何区分已存储地址与几何上的空格。它不规定内存上限或吞吐目标。

## 地址索引

`RowMajorMap<V>` 是一个按零基 `(row, col)` 地址组织的稀疏索引：

```text
BTreeMap<row, BTreeMap<col, V>>
```

- 外层只含至少有一个已存储列的行；内层只含该行已存储的列。
- `len` 记录已存储的地址数，而不是工作表矩形的格数。
- 插入新地址才增加 `len`；替换同一地址的值不增加它。移除地址后，空的行桶会
  一并移除。
- 全表迭代按行升序、同一行内按列升序重建 `CellAddress`，因此 `RowMajorMap`
  自身的迭代顺序是行主序。

该形状实际承载三类 `SheetInterior` 记录：

| 索引             | 值              | 含义                                                      |
| ---------------- | --------------- | --------------------------------------------------------- |
| `cells`          | `CellSlot`      | 字面量单元格槽位；槽位可以是直接值，也可以是 Store atom。 |
| `formula_cells`  | `FormulaRecord` | 已 hydrate 的公式记录。                                   |
| `formula_source` | `ParkedFormula` | 批量导入后尚未 hydrate 的公式源文本。                     |

因此，“地址在 `cells` 中”仅表示存在一个字面量槽位，并不自动等同于用户可见的
非空单元格：槽位读出的 `Value::Null` 会被非空枚举排除。公式地址在 hydrate 前
位于 `formula_source`，hydrate 后移入 `formula_cells`；范围扫描把两者都视为
公式地址，并在重叠时去重。

## 范围扫描

`RowMajorMap::range_iter` 先规范化 `CellRange`，随后对行键执行
`r0..=r1` 的有界查询，并在每个命中行对列键执行 `c0..=c1` 的有界查询。它只
返回存储在该矩形内的地址，顺序仍是行主序；没有记录的几何空格不会出现在迭代器中。

`Sheet::for_each_sparse_cell_with` 是值读取的稀疏入口。它先分别快照范围内的
字面量地址及已 hydrate / parked 公式地址，跳过被公式覆盖的字面量槽位和
`Value::Null` 槽位，再将两条地址序列归并成全局行主序。公式地址的值通过调用方
提供的解析器读取，使求值器可以保留当前公式或工作簿路由上下文。

`SheetEvalProvider::for_each_range_cell` 使用这个入口。因此，一个公式对大矩形
范围取值时会收到其中真实存在的字面量或公式地址，而不是为每个缺口建立单元格
记录。`clear_range` 同样先枚举范围内的非空地址，再逐个清除，不会因清除而创建
范围内原本不存在的槽位。

## 稀疏地址不改变范围几何

稀疏扫描的“未发射”不表示该位置从公式语义中消失。范围仍是一个规范化的矩形：

- 需要位置的消费者按坐标相对范围起点计算行主序位置，空格仍占位置。
- 需要空格基数的消费者以矩形格数减去已发射的非空格数，而不是物化空格。
- `for_each_non_empty_in_range` 只报告地址，不读取公式值或触发公式物化；它先报告
  公式地址、再报告可见字面量地址。需要跨两类地址的全局行主序时，应使用
  `for_each_sparse_cell_with` 的归并语义，或自行排序。

## 可验证边界

- `sheet_tests/sparse_stream.rs::sum_full_column_walks_sparse` 覆盖大名义范围中的
  两个实际单元格；`sum_stateless_no_atoms_materialized` 覆盖读取不为缺口创建
  字面量 atom。
- `sheet_tests/non_empty_enum.rs` 覆盖字面量与公式的并集、公式覆盖下的去重，以及
  清除后的非空地址语义。
- `tests/sparse_range_hole_positions.rs` 与
  `tests/sparse_range_blank_cardinality.rs` 覆盖稀疏发射之外的位置和空格基数语义。

实现依据：`excel/rust/excel-core/src/sheet_row_major_map.rs`、
`excel/rust/excel-core/src/sheet_scan.rs`、
`excel/rust/excel-core/src/sheet_eval_provider.rs`、
`excel/rust/excel-core/src/sheet_write_clear.rs`。
