#[derive(Clone, Debug, Serialize, Deserialize)]
struct NoteJSON {
    sheet: usize,
    row: u32,
    col: u32,
    text: String,
}

impl WasmWorkbook {
    fn notes_json(&self) -> Vec<NoteJSON> {
        (0..self.workbook.sheet_count())
            .flat_map(|index| {
                self.workbook
                    .sheet(index)
                    .into_iter()
                    .flat_map(move |sheet| {
                        sheet
                            .notes_in_range(Self::full_sheet_range())
                            .into_iter()
                            .map(move |(addr, text)| NoteJSON {
                                sheet: index,
                                row: addr.row,
                                col: addr.col,
                                text,
                            })
                    })
            })
            .collect()
    }

    /// 恢复在临时工作簿内完成；重复或非法条目使整个文件失败。
    fn restore_notes_json(workbook: &mut Workbook, notes: Vec<NoteJSON>) -> Result<(), String> {
        let mut seen = HashSet::new();
        for note in notes {
            if !seen.insert((note.sheet, note.row, note.col)) {
                return Err("Duplicate note cell in workbook file.".into());
            }
            let target = workbook
                .sheet_mut(note.sheet)
                .ok_or("The note worksheet no longer exists.")?;
            target.set_note(CellAddress::new(note.row, note.col), Some(&note.text))?;
        }
        Ok(())
    }

    /// 空内容、仅超链接格也能显示备注标记；不向投影泄露备注正文。
    fn append_note_cells(&self, sheet: usize, range: CellRange, out: &mut Vec<CellSnapshotJSON>) {
        let Some(target) = self.workbook.sheet(sheet) else {
            return;
        };
        let mut present: HashMap<_, _> = out
            .iter()
            .enumerate()
            .map(|(index, cell)| (cell.addr.clone(), index))
            .collect();
        for (addr, _) in target.notes_in_range(range) {
            let address = addr.to_string();
            if let Some(index) = present.get(&address) {
                out[*index].note_indicator = Some(true);
                continue;
            }
            present.insert(address.clone(), out.len());
            out.push(CellSnapshotJSON {
                sheet,
                addr: address,
                display: String::new(),
                formatted_display: None,
                input_text: String::new(),
                cell_type: "null".into(),
                is_error: false,
                formula: String::new(),
                hyperlink: target.hyperlink(addr).map(str::to_owned),
                note_indicator: Some(true),
                comment_indicator: target.comment(addr).map(|_| true),
            });
        }
    }
}
