//! 表头局部插行的验证区域前后像；只保存受影响矩形，共享原规则。
use crate::data_validation::{DataValidationRegion, MAX_VALIDATION_REGIONS};
use crate::shift::insert_row_band_range;

#[derive(Debug, Default)]
pub(super) struct ValidationShift {
    entries: Vec<(DataValidationRegion, Vec<DataValidationRegion>)>,
}

impl ValidationShift {
    pub(super) fn prepare(
        regions: &[DataValidationRegion], row: u32, columns: (u32, u32), row_count: u32,
    ) -> Result<Self, &'static str> {
        let mut entries = Vec::new();
        for entry in regions {
            let ranges = insert_row_band_range(entry.range, row, columns, row_count)
                .map_err(|_| "The header insertion would move data validation outside this worksheet.")?;
            if ranges == [entry.range] { continue; }
            let next = ranges.into_iter().map(|range|
                DataValidationRegion { range, rule: entry.rule.clone() }).collect();
            entries.push((entry.clone(), next));
        }
        let change = Self { entries };
        // 分裂后的目录也必须符合原容量约束，任何写入前检查。
        change.restore(regions, false)?;
        Ok(change)
    }

    /// 先生成已校验的最终目录，再由调用者在原 batch 内一次安装。
    /// 未受影响区域使用当前值，不会被撤销覆盖；受影响区域被外部修改则拒绝。
    pub(super) fn restore(
        &self, current: &[DataValidationRegion], undo: bool,
    ) -> Result<Option<Vec<DataValidationRegion>>, &'static str> {
        if self.entries.is_empty() { return Ok(None); }
        let mut replacements = vec![None; current.len()];
        for (before, after) in &self.entries {
            let (expected, next) = if undo {
                (after.as_slice(), std::slice::from_ref(before))
            } else {
                (std::slice::from_ref(before), after.as_slice())
            };
            for (offset, region) in expected.iter().enumerate() {
                let index = current.iter().position(|entry| entry == region)
                    .ok_or("Data validation changed outside history.")?;
                replacements[index] = Some(if offset == 0 { next } else { &[] });
            }
        }
        let mut restored = Vec::new();
        for (entry, replacement) in current.iter().zip(&replacements) {
            if let Some(next) = replacement {
                // 外部新增规则不能占用即将恢复的区域，即便没改原来的条目。
                if next.iter().any(|region| current.iter().zip(&replacements).any(|(other, change)|
                    change.is_none() && other.range.intersects(region.range))) {
                    return Err("Data validation changed outside history.");
                }
                restored.extend_from_slice(next);
            } else {
                restored.push(entry.clone());
            }
        }
        if restored.len() > MAX_VALIDATION_REGIONS {
            return Err("Too many data-validation regions.");
        }
        Ok(Some(restored))
    }

    pub(super) fn retained_bytes(&self) -> usize {
        crate::sheet::metadata_bytes(&self.entries)
    }
}
