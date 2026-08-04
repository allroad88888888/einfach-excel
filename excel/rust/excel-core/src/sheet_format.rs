//! 单元格格式与区域格式两层的读写、快照与渲染。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

#[derive(Clone, Debug)]
pub(crate) struct RangeFormat {
    pub(crate) range: CellRange,
    pub(crate) fmt: CellFormat,
}

#[derive(Clone, Debug)]
pub struct RangeFormatSnapshotLayer {
    pub range: CellRange,
    pub fmt: CellFormat,
}

#[derive(Clone, Debug)]
pub struct FormatRangeSnapshot {
    pub range: CellRange,
    pub cell_formats: Vec<(CellAddress, CellFormat)>,
    pub range_formats: Vec<RangeFormatSnapshotLayer>,
}

impl Sheet {
    // === Phase 6: cell formatting ===

    pub(crate) fn base_format_at(&self, addr: CellAddress) -> CellFormat {
        if let Some(fmt) = self.formats.get(&addr) {
            return fmt.clone();
        }
        for layer in self.range_formats.iter().rev() {
            if layer.range.contains(addr) {
                return layer.fmt.clone();
            }
        }
        CellFormat::default()
    }

    /// Set or clear the format for a cell. Passing the default `CellFormat`
    /// removes the entry, keeping the formats map sparse for empty styles.
    /// Format changes do not publish formula Store roots, but they DO fire the
    /// address listener so views can re-style without recomputing the value.
    pub fn set_format(&mut self, addr_str: &str, fmt: CellFormat) {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        if fmt == CellFormat::default() {
            self.formats.remove(&addr);
        } else {
            self.formats.insert(addr, fmt);
        }
        if self.has_address_subscribers(addr) {
            self.notify_address_subscribers(addr);
        }
    }

    /// Set a range format as a lazy layer. Existing per-cell overrides inside
    /// the range are removed, then the range layer becomes the default for all
    /// addresses in the rectangle.
    ///
    /// Returns how many subscribed addresses were notified.
    pub fn set_format_range(&mut self, range: CellRange, fmt: CellFormat) -> usize {
        let normalized = range.normalize();

        self.formats.retain(|addr, _| !normalized.contains(*addr));
        self.range_formats.push(RangeFormat {
            range: normalized,
            fmt,
        });

        let mut notified = 0usize;
        for addr in self.cell_subscriptions.keys().copied() {
            if normalized.contains(addr) && self.has_address_subscribers(addr) {
                self.notify_address_subscribers(addr);
                notified += 1;
            }
        }
        notified
    }

    /// Snapshot only sparse formatting metadata needed to undo a subsequent
    /// `set_format_range` over `range`. This does not inspect values or
    /// materialize empty cells: per-cell formats are sparse, and range format
    /// layers are metadata.
    pub fn snapshot_format_range(&self, range: CellRange) -> FormatRangeSnapshot {
        let normalized = range.normalize();
        let mut cell_formats: Vec<(CellAddress, CellFormat)> = self
            .formats
            .iter()
            .filter_map(|(addr, fmt)| {
                if normalized.contains(*addr) {
                    Some((*addr, fmt.clone()))
                } else {
                    None
                }
            })
            .collect();
        cell_formats.sort_by_key(|(addr, _)| (addr.row, addr.col));

        FormatRangeSnapshot {
            range: normalized,
            cell_formats,
            range_formats: self
                .range_formats
                .iter()
                .map(|layer| RangeFormatSnapshotLayer {
                    range: layer.range,
                    fmt: layer.fmt.clone(),
                })
                .collect(),
        }
    }

    /// Restore a formatting snapshot produced by `snapshot_format_range`.
    /// Only explicit per-cell formats inside the snapshot range are replaced;
    /// explicit formats outside the range are left alone. Range-format layers
    /// are metadata-only and are restored as a whole so overlap ordering stays
    /// exact for undo/redo.
    pub fn restore_format_range_snapshot(&mut self, snapshot: FormatRangeSnapshot) -> usize {
        let normalized = snapshot.range.normalize();
        self.formats.retain(|addr, _| !normalized.contains(*addr));
        for (addr, fmt) in snapshot.cell_formats {
            if fmt == CellFormat::default() {
                self.formats.remove(&addr);
            } else {
                self.formats.insert(addr, fmt);
            }
        }
        self.range_formats = snapshot
            .range_formats
            .into_iter()
            .map(|layer| RangeFormat {
                range: layer.range.normalize(),
                fmt: layer.fmt,
            })
            .collect();

        let mut notified = 0usize;
        for addr in self.cell_subscriptions.keys().copied() {
            if normalized.contains(addr) && self.has_address_subscribers(addr) {
                self.notify_address_subscribers(addr);
                notified += 1;
            }
        }
        notified
    }

    /// Read the base format for a cell. Returns the default when no
    /// explicit format has been set. Does not apply conditional rules —
    /// use `effective_format` for that.
    pub fn get_format(&self, addr_str: &str) -> CellFormat {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.base_format_at(addr)
    }

    /// Compute the effective format for a cell: base format with any
    /// conditional rule overrides applied to the cell's current value.
    pub fn effective_format(&self, addr_str: &str) -> CellFormat {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        let base = self.base_format_at(addr);
        if self.conditional_rules.is_empty() {
            return base;
        }
        let value = self.peek_value(addr);
        apply_rules(&base, &self.conditional_rules, &value)
    }

    /// Replace the sheet-wide conditional rule list. First match wins per
    /// cell; pass an empty Vec to clear all rules. Fires every subscribed
    /// address since the effective format of any cell may have changed.
    pub fn set_conditional_rules(&mut self, rules: Vec<ConditionalRule>) {
        self.conditional_rules = rules;
        let addrs: Vec<CellAddress> = self.cell_subscriptions.keys().copied().collect();
        for addr in addrs {
            self.notify_address_subscribers(addr);
        }
    }

    /// Read-only access to the conditional rule list.
    pub fn conditional_rules(&self) -> &[ConditionalRule] {
        &self.conditional_rules
    }

    /// Format a cell's value using its effective format. Numeric cells go
    /// through `CellFormat::format_number`; non-numeric cells fall back to
    /// the default display path (matches `value_to_display` behavior).
    pub fn formatted_display(&self, addr_str: &str) -> String {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        // Collapse spill anchor to top-left for display — UI parity with
        // the WASM boundary. The full Array is only visible to internal
        // spill bookkeeping; users see the top-left scalar at the anchor.
        let value = collapse_array_for_eval(self.peek_value(addr));
        match &value {
            Value::Number(n) => {
                let fmt = self.effective_format(addr_str);
                fmt.format_number(*n)
            }
            Value::Text(s) => s.clone(),
            Value::Boolean(b) => if *b { "TRUE" } else { "FALSE" }.into(),
            Value::Null => String::new(),
            // NOT `format!("{}", e)`: this is a rendering boundary, so it owes
            // the same Excel error vocabulary `format::value_to_display` speaks.
            // Rendering `Display` here re-opened the gap that function closed and
            // leaked the engine-internal `#TYPE!` / `#ARGS!` (neither of which
            // Excel has a code for) out of every `formatted_display` caller.
            Value::Error(e) => crate::error_display_token(e).into_owned(),
            // Unreachable: collapsed above, but keep arm for exhaustiveness.
            Value::Array(_) => String::new(),
            // Lambda values are transient evaluator state — they don't get
            // persisted into a cell. Render an empty string defensively if
            // one ever leaks through.
            Value::Lambda(_) => String::new(),
        }
    }
}
