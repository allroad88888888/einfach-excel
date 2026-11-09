// 工作簿媒体（图片字节）：存入、读取与持久化；对象经 `SheetDrawing::media` 引用 id。
use einfach_excel_core::media::{base64, MediaStore};

/// `.einfach.json` 里的一条图片：字节用 Base64，类型恢复时按文件头重新识别。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct FileMediaJSON {
    id: String,
    mime: String,
    data: String,
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 存入一张图片，返回 id；同一份字节重复存入得到同一个 id。不进撤销历史。
    pub fn put_media(&mut self, bytes: &[u8]) -> Result<String, JsValue> {
        self.media.put(bytes).map_err(JsValue::from_str)
    }

    pub fn media_bytes(&self, id: &str) -> Result<Vec<u8>, JsValue> {
        self.media
            .get(id)
            .map(|item| item.bytes.to_vec())
            .ok_or_else(|| JsValue::from_str("The image is not in this workbook."))
    }

    pub fn media_type(&self, id: &str) -> Result<String, JsValue> {
        self.media
            .get(id)
            .map(|item| item.mime.to_owned())
            .ok_or_else(|| JsValue::from_str("The image is not in this workbook."))
    }
}

impl WasmWorkbook {
    /// 只写出仍被某个对象引用的条目：删掉的图片不随文件保存。
    fn media_json(&self) -> Vec<FileMediaJSON> {
        let used: HashSet<&str> = (0..self.workbook.sheet_count())
            .filter_map(|sheet| self.workbook.sheet(sheet))
            .flat_map(|sheet| sheet.drawings())
            .filter_map(|drawing| drawing.media.as_deref())
            .collect();
        self.media
            .iter()
            .filter(|(id, _)| used.contains(id))
            .map(|(id, item)| FileMediaJSON {
                id: id.to_owned(),
                mime: item.mime.to_owned(),
                data: base64::encode(&item.bytes),
            })
            .collect()
    }

    /// 在候选工作簿上恢复；任何一条非法都使整个文件失败。对象引用缺失的图片按占位显示，不报错。
    fn restore_media_json(entries: Vec<FileMediaJSON>) -> Result<MediaStore, String> {
        let mut store = MediaStore::default();
        for entry in entries {
            let bytes = base64::decode(&entry.data)
                .ok_or_else(|| "An image in the workbook file is not valid Base64.".to_string())?;
            store.restore(entry.id, &bytes)?;
        }
        Ok(store)
    }
}

#[cfg(test)]
mod media_tests {
    use super::*;
    use einfach_excel_core::drawings::{DrawingAnchor, SheetDrawing};

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\npixels";

    fn image(id: &str, media: &str) -> String {
        serde_json::to_string(&SheetDrawing {
            id: id.into(),
            kind: "image".into(),
            anchor: DrawingAnchor { row: 0, col: 0, offset_x: 0, offset_y: 0, width: 40, height: 30 },
            refs: vec![],
            payload: serde_json::json!({}),
            media: Some(media.into()),
        })
        .unwrap()
    }

    #[test]
    fn saves_only_referenced_media_and_restores_it() {
        let mut book = WasmWorkbook::new();
        let used = book.put_media(PNG).unwrap();
        book.put_media(b"GIF89a-unused").unwrap();
        book.set_drawing(0, &image("pic-1", &used)).unwrap();
        let saved = book.media_json();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].id, used);
        let restored = WasmWorkbook::restore_media_json(saved).unwrap();
        assert_eq!(&*restored.get(&used).unwrap().bytes, PNG);
    }

    #[test]
    fn rejects_bad_base64() {
        let entry = FileMediaJSON { id: "m1".into(), mime: "image/png".into(), data: "@@".into() };
        assert!(WasmWorkbook::restore_media_json(vec![entry]).is_err());
    }
}
