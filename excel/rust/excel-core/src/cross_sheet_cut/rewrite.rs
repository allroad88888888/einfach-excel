//! 跨表剪切保留引用的工作表身份；绝对标记不会阻止被剪单元格随动。
use super::super::*;
use crate::formula::Expr;

struct MoveReferences<'a> {
    source_sheet: &'a str,
    target_sheet: &'a str,
    source: CellRange,
    target: CellAddress,
    local_source: bool,
    moved_formula: bool,
}

impl MoveReferences<'_> {
    fn references_source(&self, expr: &Expr) -> bool {
        match expr {
            Expr::CellRef(addr, _) => self.local_source && self.source.contains(*addr),
            Expr::SheetRef { sheet, addr, .. } => {
                sheet.eq_ignore_ascii_case(self.source_sheet) && self.source.contains(*addr)
            }
            Expr::Range { start, end, .. } => {
                self.local_source
                    && CellRange::new(*start, *end)
                        .normalize()
                        .intersects(self.source)
            }
            Expr::SheetRange {
                sheet, start, end, ..
            } => {
                sheet.eq_ignore_ascii_case(self.source_sheet)
                    && CellRange::new(*start, *end)
                        .normalize()
                        .intersects(self.source)
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.references_source(inner)
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange {
                start: left,
                end: right,
            } => self.references_source(left) || self.references_source(right),
            Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
                args.iter().any(|arg| self.references_source(arg))
            }
            Expr::Call(callee, args) => {
                self.references_source(callee) || args.iter().any(|arg| self.references_source(arg))
            }
            _ => false,
        }
    }

    fn mapped(&self, addr: CellAddress) -> CellAddress {
        CellAddress::new(
            self.target.row + addr.row - self.source.start.row,
            self.target.col + addr.col - self.source.start.col,
        )
    }

    fn moved_range(&self, start: CellAddress, end: CellAddress) -> Result<bool, ClipboardError> {
        let range = CellRange::new(start, end).normalize();
        if !range.intersects(self.source) {
            return Ok(false);
        }
        // 不把跨两张表的残余矩形伪装成平移后的单个范围。
        if !self.source.contains(start) || !self.source.contains(end) {
            return Err("CLIPBOARD_PARTIAL_REFERENCE_MOVE");
        }
        Ok(true)
    }

    fn rewrite(&self, expr: &mut Expr) -> Result<(), ClipboardError> {
        match expr {
            Expr::CellRef(addr, abs) if self.local_source => {
                if self.source.contains(*addr) {
                    let mapped = self.mapped(*addr);
                    *expr = if self.moved_formula {
                        Expr::CellRef(mapped, *abs)
                    } else {
                        Expr::SheetRef {
                            sheet: self.target_sheet.into(),
                            addr: mapped,
                            abs: *abs,
                        }
                    };
                } else if self.moved_formula {
                    *expr = Expr::SheetRef {
                        sheet: self.source_sheet.into(),
                        addr: *addr,
                        abs: *abs,
                    };
                }
            }
            Expr::SheetRef { sheet, addr, .. } if sheet.eq_ignore_ascii_case(self.source_sheet) => {
                if self.source.contains(*addr) {
                    *addr = self.mapped(*addr);
                    *sheet = self.target_sheet.into();
                }
            }
            Expr::Range {
                start,
                end,
                unbounded,
                abs,
            } if self.local_source => {
                let moved = self.moved_range(*start, *end)?;
                if moved {
                    *start = self.mapped(*start);
                    *end = self.mapped(*end);
                }
                if !self.moved_formula || !moved {
                    let sheet = if moved {
                        self.target_sheet
                    } else {
                        self.source_sheet
                    };
                    if moved || self.moved_formula {
                        *expr = Expr::SheetRange {
                            sheet: sheet.into(),
                            start: *start,
                            end: *end,
                            unbounded: *unbounded,
                            abs: *abs,
                        };
                    }
                }
            }
            Expr::SheetRange {
                sheet, start, end, ..
            } if sheet.eq_ignore_ascii_case(self.source_sheet) => {
                if self.moved_range(*start, *end)? {
                    *start = self.mapped(*start);
                    *end = self.mapped(*end);
                    *sheet = self.target_sheet.into();
                }
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.rewrite(inner)?
            }
            Expr::DynamicRange { .. } if self.references_source(expr) => {
                return Err("CLIPBOARD_PARTIAL_REFERENCE_MOVE");
            }
            // OFFSET 的结果区域无法仅凭静态锚点证明整体被移动，不能让它跨表跳址。
            Expr::FuncCall { name, .. }
                if name.eq_ignore_ascii_case("OFFSET") && self.references_source(expr) =>
            {
                return Err("CLIPBOARD_PARTIAL_REFERENCE_MOVE");
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange {
                start: left,
                end: right,
            } => {
                self.rewrite(left)?;
                self.rewrite(right)?;
            }
            Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
                for arg in args {
                    self.rewrite(arg)?;
                }
            }
            Expr::Call(callee, args) => {
                self.rewrite(callee)?;
                for arg in args {
                    self.rewrite(arg)?;
                }
            }
            // 依赖当前位置解析的 Table 引用不能悄悄改用目标表上下文。
            Expr::TableRef { table: None, .. }
            | Expr::TableRef {
                area: crate::formula::TableArea::ThisRow,
                ..
            } if self.moved_formula => {
                return Err("CLIPBOARD_CROSS_SHEET_TABLE");
            }
            _ => {}
        }
        Ok(())
    }
}

pub(in crate::clipboard) fn moved_formula(
    workbook: &Workbook,
    snapshot: &ClipboardSnapshot,
    target_sheet: usize,
    target: CellAddress,
    expr: &mut Expr,
) -> Result<(), ClipboardError> {
    MoveReferences {
        source_sheet: workbook
            .name(snapshot.source_sheet.ok_or("CLIPBOARD_INVALID_SHEET")?)
            .ok_or("CLIPBOARD_INVALID_SHEET")?,
        target_sheet: workbook
            .name(target_sheet)
            .ok_or("CLIPBOARD_INVALID_SHEET")?,
        source: snapshot.source,
        target,
        local_source: true,
        moved_formula: true,
    }
    .rewrite(expr)
}

pub(super) fn dependent_writes(
    workbook: &Workbook,
    snapshot: &ClipboardSnapshot,
    target_sheet: usize,
    target: CellRange,
) -> Result<Vec<(usize, CellAddress, String)>, ClipboardError> {
    let source_sheet = snapshot.source_sheet.ok_or("CLIPBOARD_INVALID_SHEET")?;
    let whole_grid = CellRange::new(
        CellAddress::new(0, 0),
        CellAddress::new(
            crate::sheet::EXCEL_MAX_ROWS - 1,
            crate::sheet::EXCEL_MAX_COLS - 1,
        ),
    );
    let mut writes = Vec::new();
    for index in 0..workbook.sheet_count() {
        let sheet = workbook.sheet(index).ok_or("CLIPBOARD_INVALID_SHEET")?;
        let rewrite = MoveReferences {
            source_sheet: workbook
                .name(source_sheet)
                .ok_or("CLIPBOARD_INVALID_SHEET")?,
            target_sheet: workbook
                .name(target_sheet)
                .ok_or("CLIPBOARD_INVALID_SHEET")?,
            source: snapshot.source,
            target: target.start,
            local_source: index == source_sheet,
            moved_formula: false,
        };
        // 仅遍历稀疏公式索引，源公式由目的地写入计划处理，覆盖的目的公式不再改写。
        for addr in sheet.formula_addrs_in_range(whole_grid) {
            if (index == source_sheet && snapshot.source.contains(addr))
                || (index == target_sheet && target.contains(addr))
            {
                continue;
            }
            let text = sheet
                .formula_text_at(addr)
                .ok_or("CLIPBOARD_INVALID_FORMULA")?;
            let mut expr = crate::parse_formula(&text).ok_or("CLIPBOARD_INVALID_FORMULA")?;
            let original = expr.clone();
            rewrite.rewrite(&mut expr)?;
            if expr != original {
                writes.push((index, addr, crate::render_formula(&expr)));
            }
        }
    }
    Ok(writes)
}
