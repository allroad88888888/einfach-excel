//! 空表输入位置与已有空白记录必须保持不同的引用语义。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, TableError, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};

fn entry(headers: bool, totals: bool, insert_row: bool) -> TableEntry {
    TableEntry::from_parts("Orders", "Sheet1", CellRange::new(CellAddress::new(2, 0),
        CellAddress::new(2 + u32::from(headers) + u32::from(totals), 1)),
        headers, totals, vec!["Item".into(), "Amount".into()]).with_insert_row(insert_row)
}

#[test]
fn empty_input_row_is_not_a_blank_record_in_same_sheet_or_cross_sheet_formulas() {
    for headers in [false, true] {
        for totals in [false, true] {
            let mut book = Workbook::new();
            let table = entry(headers, totals, true);
            book.restore_tables(TableRegistrySnapshot::from_entries(vec![table.clone()])).unwrap();
            book.add_sheet("Report");
            for sheet in [0, 1] {
                book.set_formula(sheet, "D1", "=ROWS(Orders[Amount])");
                book.set_formula(sheet, "D2", "=Orders[Amount]");
                book.set_formula(sheet, "D3", "=Orders[@Amount]");
                let name = book.name(sheet).unwrap().to_string();
                assert_eq!(book.get_cell(&name, "D1"), Value::Error(ValueError::InvalidRef));
                assert_eq!(book.get_cell(&name, "D2"), Value::Error(ValueError::InvalidRef));
                assert_eq!(book.get_cell(&name, "D3"), Value::Error(ValueError::InvalidValue));
            }
            assert!(book.get_table("Orders").unwrap().has_insert_row());
            let snapshot = book.snapshot_tables();
            assert_eq!(snapshot.entries(), &[table]);
            // 相同几何的一条空白数据记录必须使消费者失效，不能只比较坐标。
            book.restore_tables(TableRegistrySnapshot::from_entries(vec![entry(headers, totals, false)])).unwrap();
            assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(1.));
            assert_eq!(book.get_cell("Report", "D1"), Value::Number(1.));
            book.restore_tables(snapshot).unwrap();
            assert_eq!(book.get_cell("Sheet1", "D1"), Value::Error(ValueError::InvalidRef));
            assert_eq!(book.get_cell("Report", "D2"), Value::Error(ValueError::InvalidRef));
        }
    }
}

#[test]
fn malformed_insert_row_geometry_rejects_the_entire_registry_restore() {
    let mut book = Workbook::new();
    let existing = entry(false, false, false);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![existing])).unwrap();
    let snapshot = book.snapshot_tables();
    for headers in [false, true] {
        for totals in [false, true] {
            for rows in [1, 2, 3, 4] {
                if rows == 1 + u32::from(headers) + u32::from(totals) { continue; }
                let malformed = TableEntry::from_parts("Orders", "Sheet1",
                    CellRange::new(CellAddress::new(0, 0), CellAddress::new(rows - 1, 1)),
                    headers, totals, vec!["Item".into(), "Amount".into()]).with_insert_row(true);
                assert_eq!(book.restore_tables(TableRegistrySnapshot::from_entries(vec![malformed])),
                    Err(TableError::MalformedSnapshot));
                assert_eq!(book.snapshot_tables(), snapshot);
            }
        }
    }
}
