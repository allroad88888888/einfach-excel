use std::io::{Cursor, Write};

use serde_json::Value;
use zip::write::SimpleFileOptions;

fn native(bytes: Vec<u8>) -> Value {
    serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "Book").expect("converts")).unwrap()
}

fn cell<'a>(file: &'a Value, sheet: usize, addr: &str) -> Option<&'a Value> {
    file["workbook"]["cells"].as_array().unwrap().iter()
        .find(|c| c["sheet"] == sheet && c["addr"] == addr)
}

fn style<'a>(file: &'a Value, sheet: usize, addr: &str) -> Option<&'a Value> {
    file["workbook"]["formats"].as_array()?.iter()
        .find(|f| f["sheet"] == sheet)?["cellStyles"].as_array()?.iter()
        .find(|s| s["addr"] == addr).map(|s| &s["format"])
}

#[test]
fn reads_values_formulas_styles_and_layout_written_by_openpyxl() {
    let file = native(std::fs::read("tests/fixtures/basic.xlsx").unwrap());
    assert_eq!(file["format"], "einfach-workbook");
    let sheets: Vec<_> = file["workbook"]["sheets"].as_array().unwrap().iter().map(|s| s["name"].clone()).collect();
    assert_eq!(sheets, ["Orders", "Summary"]);

    assert_eq!(cell(&file, 0, "A2").unwrap()["value"], "Apple & Pear <x>");
    assert_eq!(cell(&file, 0, "B2").unwrap()["value"], 3.0);
    assert_eq!(cell(&file, 0, "E2").unwrap()["value"], true);
    assert_eq!(cell(&file, 0, "D2").unwrap()["value"], "=B2*C2");
    assert_eq!(cell(&file, 0, "B5").unwrap()["value"], "=Summary!A1&\"!\"");
    assert_eq!(cell(&file, 0, "C5").unwrap()["value"], "=XLOOKUP(\"Banana\",A2:A3,B2:B3)");
    assert_eq!(cell(&file, 1, "B2").unwrap()["value"], 42.0);

    let a1 = style(&file, 0, "A1").unwrap();
    assert_eq!((a1["bold"].clone(), a1["fontSize"].clone(), a1["fontFamily"].clone(), a1["fgColor"].clone()),
        (Value::Bool(true), Value::from(14), Value::from("Arial"), Value::from("#ff0000")));
    assert_eq!(style(&file, 0, "B1").unwrap()["bgColor"], "#00ff00");
    assert_eq!(style(&file, 0, "C1").unwrap()["borders"]["top"]["color"], "#0000ff");
    assert_eq!(style(&file, 0, "C1").unwrap()["borders"]["bottom"]["style"], "double");
    let d1 = style(&file, 0, "D1").unwrap();
    assert_eq!((d1["align"].clone(), d1["verticalAlign"].clone(), d1["wrap"].clone(), d1["indent"].clone()),
        (Value::from("center"), Value::from("top"), Value::Bool(true), Value::from(2)));
    assert_eq!(style(&file, 0, "C2").unwrap()["numberFormat"]["thousands"], true);
    assert_eq!(style(&file, 0, "E3").unwrap()["numberFormat"]["kind"], "percent");
    assert_eq!(style(&file, 0, "F2").unwrap()["numberFormat"]["pattern"], "yyyy-mm-dd");
    assert_eq!(style(&file, 0, "F3").unwrap()["numberFormat"]["kind"], "custom");
    // 未设样式的格子不应带任何格式。
    assert!(style(&file, 0, "B2").is_none());

    assert_eq!(file["workbook"]["merges"][0]["ranges"][0], serde_json::json!([6, 0, 7, 2]));
    assert_eq!(file["workbook"]["freeze"][0], serde_json::json!({"sheet": 0, "rows": 1, "cols": 1}));
    assert_eq!(file["workbook"]["sizes"][0]["colWidths"][0], serde_json::json!({"colIndex": 0, "widthPx": 145}));
    assert_eq!(file["workbook"]["sizes"][0]["rowHeights"][0], serde_json::json!({"rowIndex": 1, "heightPx": 40}));
}

fn zip(parts: &[(&str, &str)]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (path, body) in parts {
        writer.start_file(*path, SimpleFileOptions::default()).unwrap();
        writer.write_all(body.as_bytes()).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

#[test]
fn reads_excel_style_shared_strings_shared_formulas_and_dynamic_arrays() {
    let bytes = zip(&[
        ("xl/workbook.xml", r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>"#),
        ("xl/_rels/workbook.xml.rels", r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type=".../sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type=".../styles" Target="styles.xml"/></Relationships>"#),
        ("xl/sharedStrings.xml", r#"<sst><si><t>Plain</t></si><si><r><rPr><b/></rPr><t>Rich </t></r><r><t>text</t></r><rPh><t>ignored</t></rPh></si></sst>"#),
        ("xl/styles.xml", r#"<styleSheet><fonts><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font><font><sz val="11"/><color theme="4" tint="0.7999816888943144"/><name val="Calibri"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="5"/></patternFill></fill></fills><borders><border/></borders><cellXfs><xf numFmtId="0" fontId="0" fillId="0"/><xf numFmtId="10" fontId="1" fillId="2"/></cellXfs></styleSheet>"#),
        ("xl/worksheets/sheet1.xml", r#"<worksheet><sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" s="1"><v>0.25</v></c></row>
            <row r="2"><c r="A2"><v>1</v></c><c r="B2"><f t="shared" ref="B2:B4" si="0">A2*2+$A$2</f><v>3</v></c></row>
            <row r="3"><c r="A3"><v>2</v></c><c r="B3"><f t="shared" si="0"/><v>5</v></c></row>
            <row r="4"><c r="A4"><v>3</v></c><c r="B4"><f t="shared" si="0"/><v>7</v></c></row>
            <row r="6"><c r="D6"><f t="array" ref="D6:D8">_xlfn.SEQUENCE(3)</f><v>1</v></c></row>
            <row r="7"><c r="D7"><v>2</v></c></row><row r="8"><c r="D8"><v>3</v></c></row>
            <row r="9"><c r="A9" t="e"><v>#N/A</v></c><c r="B9" t="str"><f>"x"&amp;"y"</f><v>xy</v></c></row>
        </sheetData></worksheet>"#),
    ]);
    let file = native(bytes);
    assert_eq!(cell(&file, 0, "A1").unwrap()["value"], "Plain");
    assert_eq!(cell(&file, 0, "B1").unwrap()["value"], "Rich text");
    assert_eq!(cell(&file, 0, "B2").unwrap()["value"], "=A2*2+$A$2");
    assert_eq!(cell(&file, 0, "B3").unwrap()["value"], "=A3*2+$A$2");
    assert_eq!(cell(&file, 0, "B4").unwrap()["value"], "=A4*2+$A$2");
    assert_eq!(cell(&file, 0, "D6").unwrap()["value"], "=SEQUENCE(3)");
    assert!(cell(&file, 0, "D7").is_none(), "spilled results must not become literals");
    assert_eq!(cell(&file, 0, "A9").unwrap()["kind"], "error");
    assert_eq!(cell(&file, 0, "B9").unwrap()["value"], "=\"x\"&\"y\"");
    let c1 = style(&file, 0, "C1").unwrap();
    assert_eq!((c1["fgColor"].clone(), c1["bgColor"].clone(), c1["numberFormat"]["kind"].clone()),
        (Value::from("#dae3f3"), Value::from("#ed7d31"), Value::from("percent")));
}

#[test]
fn rejects_files_that_are_not_workbooks() {
    let error = einfach_xlsx::xlsx_to_native(b"not a zip".to_vec(), "x").unwrap_err();
    assert!(error.to_string().contains("not an .xlsx"));
    let error = einfach_xlsx::xlsx_to_native(zip(&[("hello.txt", "hi")]), "x").unwrap_err();
    assert!(error.to_string().contains("workbook.xml"));
}
