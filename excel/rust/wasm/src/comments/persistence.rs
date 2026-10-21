#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CommentJSON {
    sheet: usize,
    row: u32,
    col: u32,
    thread: einfach_excel_core::comments::NativeCommentThread,
}

impl WasmWorkbook {
    fn comments_json(&self) -> Vec<CommentJSON> {
        (0..self.workbook.sheet_count()).flat_map(|index| {
            self.workbook.sheet(index).into_iter().flat_map(move |sheet| {
                sheet.comments_in_range(Self::full_sheet_range()).into_iter()
                    .map(move |(addr, thread)| CommentJSON {
                        sheet: index, row: addr.row, col: addr.col, thread,
                    })
            })
        }).collect()
    }

    /// 在文件的临时工作簿内恢复，任意非法条目使整个打开操作失败。
    fn restore_comments_json(workbook: &mut Workbook, threads: Vec<CommentJSON>) -> Result<(), String> {
        let mut seen = HashSet::new();
        for comment in threads {
            if !seen.insert((comment.sheet, comment.row, comment.col)) {
                return Err("Duplicate comment cell in workbook file.".into());
            }
            workbook.restore_comment_thread(comment.sheet,
                CellAddress::new(comment.row, comment.col), comment.thread)?;
        }
        Ok(())
    }

    /// 投影只携带标记；正文与事件历史必须显式读取，不随滚动复制。
    fn append_comment_cells(&self, sheet: usize, range: CellRange, out: &mut Vec<CellSnapshotJSON>) {
        let Some(target) = self.workbook.sheet(sheet) else { return; };
        let mut present: HashMap<_, _> = out.iter().enumerate()
            .map(|(index, cell)| (cell.addr.clone(), index)).collect();
        for addr in target.comment_cells_in_range(range) {
            let address = addr.to_string();
            if let Some(index) = present.get(&address) {
                out[*index].comment_indicator = Some(true);
                continue;
            }
            present.insert(address.clone(), out.len());
            out.push(CellSnapshotJSON {
                sheet, addr: address, display: String::new(), formatted_display: None,
                input_text: String::new(), cell_type: "null".into(), is_error: false,
                formula: String::new(), hyperlink: target.hyperlink(addr).map(str::to_owned),
                note_indicator: target.note(addr).map(|_| true), comment_indicator: Some(true),
            });
        }
    }
}
