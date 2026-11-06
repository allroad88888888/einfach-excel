/// 文件里的数据引用：跨表时存表名（key 不跨会话稳定）；缺省 = 对象所在的表。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileDrawingRange {
    start_row: u32,
    start_col: u32,
    end_row: u32,
    end_col: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sheet_name: Option<String>,
}

/// 与 `SheetDrawing` 同形，只有引用换成按表名的 `FileDrawingRange`。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileDrawing {
    id: String,
    kind: String,
    anchor: einfach_excel_core::drawings::DrawingAnchor,
    #[serde(default)]
    refs: Vec<Option<FileDrawingRange>>,
    #[serde(default = "empty_drawing_payload")]
    payload: serde_json::Value,
}

fn empty_drawing_payload() -> serde_json::Value {
    serde_json::Value::Object(Default::default())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct SheetDrawingsJSON {
    sheet: usize,
    drawings: Vec<FileDrawing>,
}

impl FileDrawing {
    /// key -> 表名；指向已删除的表（或自己）的引用：已删除写成 null，自己省略表名。
    fn from_core(
        workbook: &Workbook,
        owner: usize,
        drawing: &einfach_excel_core::drawings::SheetDrawing,
    ) -> Self {
        let refs = drawing
            .refs
            .iter()
            .map(|slot| {
                let range = (*slot)?;
                let sheet_name = match range.sheet {
                    None => None,
                    Some(key) => {
                        let index = (0..workbook.sheet_count())
                            .find(|&i| workbook.sheet_key(i) == Some(key))?;
                        (index != owner).then(|| workbook.name(index).unwrap().to_owned())
                    }
                };
                Some(FileDrawingRange {
                    start_row: range.start_row,
                    start_col: range.start_col,
                    end_row: range.end_row,
                    end_col: range.end_col,
                    sheet_name,
                })
            })
            .collect();
        Self {
            id: drawing.id.clone(),
            kind: drawing.kind.clone(),
            anchor: drawing.anchor,
            refs,
            payload: drawing.payload.clone(),
        }
    }

    /// 表名 -> key；等于对象所在表的 -> None，找不到的表名 -> 该引用 None（#REF!）。
    fn into_core(
        self,
        workbook: &Workbook,
        owner: usize,
    ) -> einfach_excel_core::drawings::SheetDrawing {
        let refs = self
            .refs
            .into_iter()
            .map(|slot| {
                let range = slot?;
                let sheet = match range.sheet_name.as_deref() {
                    None => None,
                    Some(name) => match (0..workbook.sheet_count())
                        .find(|&i| workbook.name(i) == Some(name))
                    {
                        Some(index) if index == owner => None,
                        Some(index) => Some(workbook.sheet_key(index)?),
                        None => return None,
                    },
                };
                Some(einfach_excel_core::drawings::DrawingRange {
                    start_row: range.start_row,
                    start_col: range.start_col,
                    end_row: range.end_row,
                    end_col: range.end_col,
                    sheet,
                })
            })
            .collect();
        einfach_excel_core::drawings::SheetDrawing {
            id: self.id,
            kind: self.kind,
            anchor: self.anchor,
            refs,
            payload: self.payload,
        }
    }
}
