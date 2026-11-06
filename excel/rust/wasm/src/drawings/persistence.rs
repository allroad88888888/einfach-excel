impl WasmWorkbook {
    fn drawings_json(&self) -> Vec<SheetDrawingsJSON> {
        (0..self.workbook.sheet_count())
            .filter_map(|sheet| {
                let drawings = self.workbook.sheet(sheet)?.drawings();
                (!drawings.is_empty()).then(|| SheetDrawingsJSON {
                    sheet,
                    drawings: drawings
                        .iter()
                        .map(|drawing| FileDrawing::from_core(&self.workbook, sheet, drawing))
                        .collect(),
                })
            })
            .collect()
    }

    /// 恢复在临时工作簿内完成（所有表已建好）；重复表、重复 id 或非法对象使整个文件失败。
    fn restore_drawings_json(
        workbook: &mut Workbook,
        entries: Vec<SheetDrawingsJSON>,
    ) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert(entry.sheet) {
                return Err("Duplicate object worksheet in workbook file.".into());
            }
            if workbook.sheet(entry.sheet).is_none() {
                return Err("The object worksheet no longer exists.".into());
            }
            let drawings = entry
                .drawings
                .into_iter()
                .map(|drawing| drawing.into_core(workbook, entry.sheet))
                .collect();
            workbook
                .sheet_mut(entry.sheet)
                .unwrap()
                .replace_drawings(drawings)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod drawing_persistence_tests {
    use super::*;
    use einfach_excel_core::drawings::{DrawingAnchor, DrawingRange, SheetDrawing};

    fn drawing(id: &str, row: u32) -> SheetDrawing {
        SheetDrawing {
            id: id.to_owned(),
            kind: "chart".to_owned(),
            anchor: DrawingAnchor {
                row,
                col: 2,
                offset_x: 3,
                offset_y: 4,
                width: 320,
                height: 180,
            },
            refs: vec![
                Some(DrawingRange {
                    start_row: 0,
                    start_col: 0,
                    end_row: 9,
                    end_col: 1,
                    sheet: None,
                }),
                None,
            ],
            payload: serde_json::json!({ "title": "Sales", "series": [1, 2] }),
        }
    }

    fn plain(drawings: Vec<SheetDrawing>) -> Vec<FileDrawing> {
        let book = WasmWorkbook::new();
        drawings
            .iter()
            .map(|d| FileDrawing::from_core(&book.workbook, 0, d))
            .collect()
    }

    fn book_with_drawings() -> WasmWorkbook {
        let mut book = WasmWorkbook::new();
        let second = book.workbook.add_sheet("Second");
        let first = book.workbook.sheet_mut(0).unwrap();
        first.set_drawing(drawing("a", 1)).unwrap();
        first.set_drawing(drawing("b", 2)).unwrap();
        book.workbook
            .sheet_mut(second)
            .unwrap()
            .set_drawing(drawing("c", 3))
            .unwrap();
        book
    }

    fn catalog(book: &WasmWorkbook, sheet: usize) -> Vec<SheetDrawing> {
        book.workbook.sheet(sheet).unwrap().drawings().to_vec()
    }

    #[test]
    fn a_workbook_without_objects_exports_no_entries() {
        assert!(WasmWorkbook::new().drawings_json().is_empty());
    }

    #[test]
    fn drawings_json_lists_only_sheets_that_have_objects() {
        let mut book = book_with_drawings();
        book.workbook.sheet_mut(0).unwrap().remove_drawing("a");
        book.workbook.sheet_mut(0).unwrap().remove_drawing("b");
        let entries = book.drawings_json();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].sheet, 1);
        assert_eq!(entries[0].drawings, plain(vec![drawing("c", 3)]));
    }

    #[test]
    fn drawings_json_round_trips_through_the_wire_format() {
        let source = book_with_drawings();
        let wire = serde_json::to_value(source.drawings_json()).unwrap();
        assert_eq!(wire[0]["sheet"], 0);
        assert_eq!(wire[0]["drawings"][0]["anchor"]["offsetX"], 3);
        assert!(wire[0]["drawings"][0]["refs"][1].is_null());
        let entries: Vec<SheetDrawingsJSON> = serde_json::from_value(wire).unwrap();
        let mut target = WasmWorkbook::new();
        target.workbook.add_sheet("Second");
        WasmWorkbook::restore_drawings_json(&mut target.workbook, entries).unwrap();
        assert_eq!(catalog(&target, 0), catalog(&source, 0));
        assert_eq!(catalog(&target, 1), catalog(&source, 1));
        assert_eq!(catalog(&target, 0)[0].id, "a");
    }

    #[test]
    fn restore_replaces_the_catalog_of_every_listed_sheet() {
        let mut target = WasmWorkbook::new();
        target
            .workbook
            .sheet_mut(0)
            .unwrap()
            .set_drawing(drawing("old", 0))
            .unwrap();
        let entries = vec![SheetDrawingsJSON {
            sheet: 0,
            drawings: plain(vec![drawing("new", 5)]),
        }];
        WasmWorkbook::restore_drawings_json(&mut target.workbook, entries).unwrap();
        assert_eq!(catalog(&target, 0), vec![drawing("new", 5)]);
    }

    #[test]
    fn restore_rejects_duplicate_sheets_missing_sheets_duplicate_ids_and_invalid_objects() {
        let mut bad_kind = drawing("x", 0);
        bad_kind.kind = "BAD".into();
        let cases: Vec<Vec<SheetDrawingsJSON>> = vec![
            vec![
                SheetDrawingsJSON {
                    sheet: 0,
                    drawings: plain(vec![drawing("a", 0)]),
                },
                SheetDrawingsJSON {
                    sheet: 0,
                    drawings: plain(vec![drawing("b", 0)]),
                },
            ],
            vec![SheetDrawingsJSON {
                sheet: 7,
                drawings: plain(vec![drawing("a", 0)]),
            }],
            vec![SheetDrawingsJSON {
                sheet: 0,
                drawings: plain(vec![drawing("a", 0), drawing("a", 1)]),
            }],
            vec![SheetDrawingsJSON {
                sheet: 0,
                drawings: plain(vec![bad_kind]),
            }],
        ];
        for entries in cases {
            let mut target = WasmWorkbook::new();
            assert!(WasmWorkbook::restore_drawings_json(&mut target.workbook, entries).is_err());
        }
    }

    #[test]
    fn the_persistence_file_round_trips_drawings() {
        let source = book_with_drawings();
        let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        assert_eq!(json["drawings"].as_array().unwrap().len(), 2);
        assert_eq!(json["drawings"][1]["sheet"], 1);
        assert_eq!(json["drawings"][1]["drawings"][0]["id"], "c");
        let mut restored = WasmWorkbook::new();
        restored
            .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
            .unwrap();
        assert_eq!(restored.workbook.sheet_count(), 2);
        assert_eq!(catalog(&restored, 0), catalog(&source, 0));
        assert_eq!(catalog(&restored, 1), catalog(&source, 1));
    }

    #[test]
    fn a_file_without_objects_omits_the_field_and_a_legacy_file_restores_empty() {
        let mut book = book_with_drawings();
        let with_objects = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
        for sheet in 0..2 {
            for id in ["a", "b", "c"] {
                book.workbook.sheet_mut(sheet).unwrap().remove_drawing(id);
            }
        }
        let empty = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
        assert!(empty.get("drawings").is_none());
        // Restoring a file that lacks the key must clear objects already in the workbook.
        let mut live = WasmWorkbook::new();
        live.restore_persistence_v1_json(serde_json::from_value(with_objects).unwrap())
            .unwrap();
        assert_eq!(catalog(&live, 0).len(), 2);
        live.restore_persistence_v1_json(serde_json::from_value(empty).unwrap())
            .unwrap();
        assert!(catalog(&live, 0).is_empty());
        assert!(live.drawings_json().is_empty());
    }

    #[test]
    fn an_invalid_object_in_the_file_leaves_the_open_workbook_untouched() {
        let mut live = book_with_drawings();
        let mut json = serde_json::to_value(live.snapshot_persistence_v1_json()).unwrap();
        json["drawings"][0]["drawings"][0]["anchor"]["width"] = 0.into();
        let payload = serde_json::from_value(json).unwrap();
        assert!(live.restore_persistence_v1_json(payload).is_err());
        assert_eq!(catalog(&live, 0).len(), 2);
        assert_eq!(catalog(&live, 0)[0].anchor.width, 320);
    }
}
