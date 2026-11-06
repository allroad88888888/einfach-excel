//! 复制工作表：新表名唯一，单元格、公式与全部工作表级数据一次性在 Rust 内拷出。
use super::*;
use crate::formula::Expr;
use workbook_sheet_refs::rewrite_sheet_refs;

const FULL_SHEET: fn() -> CellRange = || {
    CellRange::new(
        CellAddress::new(0, 0),
        CellAddress::new(crate::sheet::EXCEL_MAX_ROWS - 1, crate::sheet::EXCEL_MAX_COLS - 1),
    )
};

/// 源表改名映射：复制后的公式里，指向源表自身或其 Table 的限定引用转向副本。
struct CopyRenames {
    old_sheet: String,
    new_sheet: String,
    tables: Vec<(String, String)>,
}

impl CopyRenames {
    fn source(&self, text: &str) -> String {
        if !text.contains('!') && (self.tables.is_empty() || !text.contains('[')) {
            return text.to_owned();
        }
        let Some(mut expr) = parse_formula(text) else {
            return text.to_owned();
        };
        let original = expr.clone();
        rewrite_sheet_refs(&mut expr, &self.old_sheet, Some(&self.new_sheet));
        self.rename_tables(&mut expr);
        if expr == original { text.to_owned() } else { crate::render_formula(&expr) }
    }

    fn rename_tables(&self, expr: &mut Expr) {
        match expr {
            Expr::TableRef { table: Some(table), .. } => {
                if let Some((_, new)) =
                    self.tables.iter().find(|(old, _)| old.eq_ignore_ascii_case(table))
                {
                    *table = new.clone();
                }
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.rename_tables(inner)
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange { start: left, end: right } => {
                self.rename_tables(left);
                self.rename_tables(right);
            }
            Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
                args.iter_mut().for_each(|arg| self.rename_tables(arg))
            }
            Expr::Call(callee, args) => {
                self.rename_tables(callee);
                args.iter_mut().for_each(|arg| self.rename_tables(arg));
            }
            _ => {}
        }
    }
}

impl Workbook {
    /// Excel 规则：`Name (2)`；源名已带 ` (N)` 时从基名重新数。总长不超 31。
    pub fn unique_copy_name(&self, index: usize) -> Result<String, &'static str> {
        let name = self.name(index).ok_or("The worksheet no longer exists.")?;
        let base = name
            .strip_suffix(')')
            .and_then(|head| head.rsplit_once(" ("))
            .filter(|(_, digits)| !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()))
            .map_or(name, |(base, _)| base);
        for n in 2usize.. {
            let suffix = format!(" ({n})");
            let mut stem = String::new();
            for ch in base.chars() {
                if stem.encode_utf16().count() + ch.len_utf16() + suffix.len() > 31 {
                    break;
                }
                stem.push(ch);
            }
            let candidate = format!("{stem}{suffix}");
            if self.validate_sheet_name(None, &candidate).is_ok() {
                return Ok(candidate);
            }
        }
        unreachable!()
    }

    /// 在源表之后创建副本并返回其索引；任何一步失败都会撤回已创建的新表。
    pub fn copy_sheet_after(&mut self, source: usize, name: &str) -> Result<usize, &'static str> {
        let old_name = self.name(source).ok_or("The worksheet no longer exists.")?.to_owned();
        let appended = self.edit_sheet(None, name)?;
        let target = source + 1;
        if appended != target && !self.move_sheet(appended, target) {
            self.archive_sheet(appended);
            return Err("Could not place the copied worksheet.");
        }
        let new_name = self.name(target).unwrap().to_owned();
        let renames = CopyRenames { old_sheet: old_name, new_sheet: new_name, tables: Vec::new() };
        if let Err(error) = self.fill_sheet_copy(source, target, renames) {
            self.archive_sheet(target);
            return Err(error);
        }
        Ok(target)
    }

    fn fill_sheet_copy(
        &mut self,
        source: usize,
        target: usize,
        mut renames: CopyRenames,
    ) -> Result<(), &'static str> {
        renames.tables = self.copy_tables(&renames.old_sheet, &renames.new_sheet);
        self.copy_scoped_names(source, target, &renames);
        self.copy_cells(source, target, &renames)?;
        self.copy_sheet_data(source, target)?;
        self.copy_workbook_sheet_config(source, target);
        self.copy_filter(source, target);
        let color = self.sheets[source].tab_color.clone();
        self.sheets[target].tab_color = color;
        self.sheets[target].view = self.sheets[source].view;
        // Protection belongs to the copied sheet identity, after its data has been installed.
        let protection = self.read_protection(source)?;
        self.protection.insert(self.sheet_keys[target], protection);
        Ok(())
    }

    fn copy_scoped_names(&mut self, source: usize, target: usize, renames: &CopyRenames) {
        let Some(source_key) = self.sheet_key(source) else {
            return;
        };
        let Some(target_key) = self.sheet_key(target) else {
            return;
        };
        let entries: Vec<(String, NamedEntry)> = self
            .sheet_named_values
            .iter()
            .filter(|((sk, _), _)| *sk == source_key)
            .map(|((_, key), entry)| (key.clone(), entry.clone()))
            .collect();
        if entries.is_empty() {
            return;
        }
        for (key, mut entry) in entries {
            match &mut entry.definition {
                NamedDefinition::Range { sheet_key, .. } if *sheet_key == source_key => {
                    *sheet_key = target_key;
                }
                NamedDefinition::Formula { source: f_src, expr } => {
                    let rewritten = renames.source(f_src);
                    if let Some((next_src, next_expr)) =
                        Self::parse_named_formula_source(&rewritten, true)
                    {
                        *f_src = next_src;
                        *expr = next_expr;
                    }
                }
                _ => {}
            }
            self.sheet_named_values.insert((target_key, key), entry);
        }
        self.sync_atom_names();
    }

    /// Table 按 Excel 规则改名为 `Name_2`…，注册先于公式安装，结构化引用才能解析。
    fn copy_tables(&mut self, old_sheet: &str, new_sheet: &str) -> Vec<(String, String)> {
        let sources: Vec<TableEntry> =
            self.tables.values().filter(|table| table.sheet_name == old_sheet).cloned().collect();
        let mut renamed = Vec::new();
        for mut table in sources {
            let old = table.canonical_name.clone();
            let new = (2usize..)
                .map(|n| format!("{old}_{n}"))
                .find(|name| self.validate_table_name(name, None).is_ok())
                .unwrap();
            table.canonical_name = new.clone();
            table.sheet_name = new_sheet.to_owned();
            self.tables.insert(new.to_ascii_uppercase(), table);
            renamed.push((old, new));
        }
        if !renamed.is_empty() {
            self.bump_tables_epoch();
        }
        renamed
    }

    fn copy_cells(
        &mut self,
        source: usize,
        target: usize,
        renames: &CopyRenames,
    ) -> Result<(), &'static str> {
        let mut primitives = HashMap::new();
        let mut formulas = HashMap::new();
        let sheet = &self.sheets[source];
        sheet.for_each_non_empty(|addr| {
            if sheet.is_spilled(addr) {
                return;
            }
            if let Some(text) = sheet.get_formula(&addr.to_string_repr()) {
                formulas.insert(addr, renames.source(&text));
            } else {
                let value = sheet.peek_value(addr);
                if value != Value::Null {
                    primitives.insert(addr, value);
                }
            }
        });
        if primitives.is_empty() && formulas.is_empty() {
            return Ok(());
        }
        self.ensure_sheet_unprotected(target)?;
        self.install_sheet_bulk_preflighted(target, primitives, formulas)
            .map(|_| ())
            .map_err(|_| "Could not copy the worksheet cells.")
    }

    /// 格式、尺寸、合并、冻结、大纲、验证、链接、备注、批注与手动隐藏的行列。
    fn copy_sheet_data(&mut self, source: usize, target: usize) -> Result<(), &'static str> {
        let full = FULL_SHEET();
        let formats = self.sheets[source].snapshot_format_range(full);
        let defaults = self.sheets[source].defaults();
        let rows = self.sheets[source].all_row_heights();
        let cols = self.sheets[source].all_col_widths();
        let merges = self.sheets[source].merged_ranges().to_vec();
        let freeze = self.sheets[source].frozen_panes();
        let outline = self.sheets[source].outline().clone();
        let validations = self.sheets[source].data_validations().to_vec();
        let rich_text = self.sheets[source].rich_text_in_range(full);
        let drawings = self.sheets[source].drawings().to_vec();
        let links = self.sheets[source].hyperlinks_in_range(full);
        let notes = self.sheets[source].notes_in_range(full);
        let comments: Vec<_> = self.sheets[source]
            .comment_cells_in_range(full)
            .into_iter()
            .filter_map(|addr| Some((addr, self.sheets[source].comment(addr)?.clone())))
            .collect();
        let visibility = self.sheet_visibility(source)?;
        let copy = &mut self.sheets[target];
        copy.set_defaults(defaults)?;
        copy.restore_format_range_snapshot(formats);
        rows.into_iter().for_each(|(row, height)| {
            let _ = copy.set_row_height(row, height);
        });
        cols.into_iter().for_each(|(col, width)| {
            let _ = copy.set_col_width(col, width);
        });
        copy.restore_merged_ranges(merges)?;
        copy.set_frozen_panes(freeze)?;
        for region in validations {
            copy.set_data_validation(region.range, Some(region.rule.as_ref().clone()))?;
        }
        copy.restore_rich_text(full, &rich_text);
        copy.replace_drawings(drawings)?;
        for (addr, url) in links {
            copy.set_hyperlink(addr, Some(&url))?;
        }
        for (addr, text) in notes {
            copy.set_note(addr, Some(&text))?;
        }
        for (addr, thread) in comments {
            self.restore_comment_thread(target, addr, thread)?;
        }
        self.set_outline(target, outline)?;
        self.restore_sheet_visibility(target, &visibility)
    }

    fn copy_workbook_sheet_config(&mut self, source: usize, target: usize) {
        self.print_configs[target] = self.print_configs[source].clone();
        self.conditional_formats[target] = self.conditional_formats[source].clone();
        self.conditional_range_atoms.borrow_mut().clear();
        let rules = self.sheets[source].conditional_rules().to_vec();
        self.sheets[target].set_conditional_rules(rules);
    }

    fn copy_filter(&mut self, source: usize, target: usize) {
        let filter = self.sheets[source].filter().cloned();
        if self.sheets[target].commit_filter_state(filter) {
            self.republish_hidden(target);
        }
    }
}
