//! 状态栏读取完整选区的原生数值；不依赖可见投影，也不创建空白格。
use crate::{CellRange, Workbook};
use einfach_core::Value;
use std::collections::BTreeMap;

#[derive(Debug, PartialEq)]
pub struct SelectionNumbers {
    pub count: u64,
    pub numeric_count: u64,
    /// 无数值或结果超出 f64 时为 None，不能把溢出伪装成零。
    pub sum: Option<f64>,
    pub average: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Default)]
struct Numbers {
    non_empty_count: u64,
    count: u64,
    min: Option<f64>,
    max: Option<f64>,
    scale: f64,
    total: f64,
    correction: f64,
}

impl Numbers {
    fn add(&mut self, number: f64) {
        if !number.is_finite() {
            return;
        }
        self.count += 1;
        // 用第一个数初始化，不能让默认的零污染全正数或全负数选区。
        self.min = Some(self.min.map_or(number, |min| min.min(number)));
        self.max = Some(self.max.map_or(number, |max| max.max(number)));
        // 缩放后做补偿求和：保留极大数的有限平均值，减少正负抵消的舍入误差。
        if number.abs() > self.scale {
            let ratio = self.scale / number.abs();
            self.total *= ratio;
            self.correction *= ratio;
            self.scale = number.abs();
        }
        if self.scale == 0.0 {
            return;
        }
        let value = number / self.scale;
        let next = self.total + value;
        self.correction += if self.total.abs() >= value.abs() {
            (self.total - next) + value
        } else {
            (value - next) + self.total
        };
        self.total = next;
    }

    fn finish(self) -> SelectionNumbers {
        let total = self.total + self.correction;
        let sum = total * self.scale;
        let average = if sum.is_finite() {
            sum / self.count as f64
        } else {
            (total / self.count as f64) * self.scale
        };
        SelectionNumbers {
            count: self.non_empty_count,
            numeric_count: self.count,
            sum: (self.count > 0 && sum.is_finite()).then_some(sum),
            average: (self.count > 0 && average.is_finite()).then_some(average),
            min: self.min,
            max: self.max,
        }
    }
}

impl Workbook {
    /// 统计选区并集。数值摘要排除文本/布尔/错误；非空计数包含它们。隐藏格仍属于选区。
    pub fn aggregate_selection(
        &self,
        targets: &[(usize, CellRange)],
    ) -> Result<SelectionNumbers, &'static str> {
        if targets.is_empty() || targets.len() > 1024 {
            return Err("Choose between 1 and 1024 aggregate ranges.");
        }
        let mut sheets = BTreeMap::<usize, Vec<CellRange>>::new();
        for &(sheet, range) in targets {
            if self.sheet(sheet).is_none()
                || range != range.normalize()
                || range.end.row >= 1_048_576
                || range.end.col >= 16_384
            {
                return Err("Invalid aggregate range.");
            }
            sheets.entry(sheet).or_default().push(range);
        }
        let mut numbers = Numbers::default();
        for (sheet, ranges) in sheets {
            let mut bounds = ranges[0];
            for range in &ranges[1..] {
                bounds.start.row = bounds.start.row.min(range.start.row);
                bounds.start.col = bounds.start.col.min(range.start.col);
                bounds.end.row = bounds.end.row.max(range.end.row);
                bounds.end.col = bounds.end.col.max(range.end.col);
            }
            // 同一格只访问一次，重叠选区不能重复累加；稀疏扫描包含原生公式求值。
            self.for_each_sparse_range_cell(sheet, bounds, |address, value| {
                if ranges.iter().any(|range| range.contains(address)) {
                    // 数组锚点只代表左上角；其余溢出格由稀疏扫描各自发出。
                    let scalar = match &value {
                        Value::Array(array) => array.get(0, 0),
                        _ => Some(&value),
                    };
                    // COUNTA 口径：空字符串是内容；只有真正空白（Null）不计数。
                    if scalar.is_some_and(|value| !matches!(value, Value::Null)) {
                        numbers.non_empty_count += 1;
                    }
                    if let Some(Value::Number(number)) = scalar {
                        numbers.add(*number);
                    }
                }
            });
        }
        Ok(numbers.finish())
    }
}
