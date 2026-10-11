//! `#` 引用保留数组身份；普通地址和 INDEX 取单值仍是标量。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, Workbook};

fn assert_array(book: &Workbook, address: &str, rows: u32, first: f64) {
    let Value::Array(array) = book.get_cell("Sheet1", address) else {
        panic!("{address} must remain an array with {rows} rows");
    };
    assert_eq!(array.shape(), (rows, 1));
    assert_eq!(array.get(0, 0), Some(&Value::Number(first)));
    assert_eq!(
        book.sheet(0).unwrap().spill_info(CellAddress::parse(address).unwrap()),
        Some((rows, 1)),
    );
}

#[test]
fn single_cell_spill_references_preserve_array_identity_without_widening_scalars() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(1)");
    for (address, formula, first) in [
        ("C1", "=A1#", 1.0),
        ("E1", "=A1#*10", 10.0),
        ("G1", "=IF(TRUE,A1#,#REF!)+2", 3.0),
        ("I1", "=LET(values,A1#,values*3)", 3.0),
    ] {
        assert!(book.set_formula(0, address, formula));
        assert_array(&book, address, 1, first);
    }
    book.set_formula(0, "K1", "=SUM(E1#)");
    assert_eq!(book.get_cell("Sheet1", "K1"), Value::Number(10.0));
    for formula in ["=A1+1", "=A1:A1+1", "=INDEX(A1#,1,1)+1"] {
        book.set_formula(0, "K2", formula);
        assert_eq!(book.get_cell("Sheet1", "K2"), Value::Number(2.0), "{formula}");
    }
}

#[test]
fn cross_sheet_arithmetic_spill_survives_shrink_and_growth() {
    let mut book = Workbook::new();
    let source = book.add_sheet("Source");
    book.set_cell(source, "C1", Value::Number(4.0));
    book.set_formula(source, "A1", "=SEQUENCE(C1)");
    book.set_formula(0, "A1", "=Source!A1#*10");
    book.set_formula(0, "C1", "=A1#");
    book.set_formula(0, "E1", "=SUM(C1#)");
    for rows in [4, 1, 3, 1, 4] {
        book.set_cell(source, "C1", Value::Number(f64::from(rows)));
        assert_array(&book, "A1", rows, 10.0);
        assert_array(&book, "C1", rows, 10.0);
        assert_eq!(book.get_cell("Sheet1", "E1"), Value::Number(f64::from(rows * (rows + 1) * 5)));
        assert_eq!(book.get_cell("Sheet1", &format!("A{}", rows + 1)), Value::Null);
        assert_eq!(book.get_cell("Sheet1", &format!("C{}", rows + 1)), Value::Null);
    }
}

#[test]
fn blocked_spill_propagates_error_then_recovers_as_single_cell_array() {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Text("keep".into()));
    book.set_formula(0, "A1", "=SEQUENCE(2)");
    book.set_formula(0, "C1", "=A1#*10");
    book.set_formula(0, "E1", "=SUM(C1#)");
    assert_eq!(book.get_cell("Sheet1", "E1"), Value::Error(ValueError::Spill));
    book.set_formula(0, "A1", "=SEQUENCE(1)");
    assert_array(&book, "C1", 1, 10.0);
    assert_eq!(book.get_cell("Sheet1", "E1"), Value::Number(10.0));
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Text("keep".into()));
    book.set_formula(0, "A1", "=42");
    assert_eq!(book.get_cell("Sheet1", "E1"), Value::Error(ValueError::InvalidRef));
}
