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

fn feature_file() -> Value {
    native(std::fs::read("tests/fixtures/features.xlsx").unwrap())
}

#[test]
fn reads_hidden_rows_columns_links_notes_names_and_tables() {
    let file = feature_file();
    let book = &file["workbook"];
    assert_eq!(book["hidden"], serde_json::json!([{"sheet": 0, "rows": [3]}]));
    assert_eq!(book["hiddenColumns"], serde_json::json!([{"sheet": 0, "columns": [2]}]));
    // 隐藏行/列之外的尺寸照常保留（第 5 行 30pt = 40px，B 列 14 字符 = 103px）。
    assert_eq!(book["sizes"][0]["rowHeights"], serde_json::json!([{"rowIndex": 4, "heightPx": 40}]));
    assert_eq!(book["sizes"][0]["colWidths"], serde_json::json!([{"colIndex": 1, "widthPx": 103}]));
    // 内部跳转（#Data!A1）没有原生对应物，只留外部链接。
    assert_eq!(book["hyperlinks"], serde_json::json!([{"sheet": 0, "row": 9, "col": 0, "url": "https://example.com/a?b=1&c=2"}]));
    assert_eq!(book["notes"], serde_json::json!([{"sheet": 0, "row": 9, "col": 1, "text": "Check this <value>\nsecond line"}]));
    // 公式型名字（Computed）被跳过。
    assert_eq!(book["namedRanges"], serde_json::json!([
        {"name": "Quantities", "target": {"sheet": 0, "range": [1, 1, 6, 1]}},
        {"name": "Other", "target": {"sheet": 1, "range": [1, 1, 1, 1]}}]));
    let table = &book["tables"][0];
    assert_eq!((table["name"].clone(), table["range"].clone(), table["sheet"].clone()), ("Sales".into(), "A1:D7".into(), "Data".into()));
    assert_eq!(table["columns"], serde_json::json!(["Name", "Qty", "Note", "Day"]));
    assert_eq!(table["style"]["preset"], "blue");
    assert_eq!(table["style"]["firstColumn"], true);
}

#[test]
fn reads_data_validations() {
    let file = feature_file();
    let regions = file["workbook"]["dataValidations"][0]["regions"].as_array().unwrap();
    let rule = |range: [u32; 4]| regions.iter().find(|r| r["range"] == serde_json::json!(range)).unwrap()["rule"].clone();
    let list = rule([1, 5, 5, 5]);
    assert_eq!(list["items"], serde_json::json!(["red", "green", "blue"]));
    assert_eq!(list["inputMessage"]["title"], "Pick");
    assert_eq!(list["errorAlert"]["style"], "warning");
    let whole = rule([1, 6, 3, 6]);
    assert_eq!((whole["operator"].clone(), whole["min"].clone(), whole["ignoreBlank"].clone()), ("greater-than".into(), 5.0.into(), false.into()));
    assert_eq!(rule([1, 8, 1, 8])["min"], "2026-01-01");
    assert_eq!(rule([1, 8, 1, 8])["max"], "2026-12-31");
    assert_eq!(rule([1, 11, 1, 11])["min"], "08:30");
    assert_eq!(rule([1, 10, 4, 10])["formula"], "=LEN(K2)>2");
    assert_eq!(rule([1, 10, 4, 10])["anchor"], serde_json::json!({"row": 1, "col": 10}));
    assert_eq!(rule([1, 9, 1, 9])["kind"], "text-length");
}

#[test]
fn reads_conditional_formats_in_priority_order() {
    let file = feature_file();
    let rules = file["workbook"]["conditionalFormats"][0]["rules"].as_array().unwrap();
    let find = |kind: &str, detail: &str| -> Value {
        rules.iter().map(|r| &r["rule"]).find(|rule| {
            rule["kind"] == kind && (detail.is_empty() || [&rule["operator"], &rule["condition"], &rule["mode"]].iter().any(|v| *v == detail))
        }).unwrap_or_else(|| panic!("{kind} {detail}")).clone()
    };
    let gt = find("cell-value", "gt");
    assert_eq!((gt["value"].clone(), gt["format"]["bgColor"].clone(), gt["format"]["fgColor"].clone(), gt["format"]["bold"].clone()),
        ("30".into(), "#ffff00".into(), "#ff0000".into(), true.into()));
    assert_eq!(find("cell-value", "between")["value2"], "40");
    assert_eq!(find("formula", "")["formula"], "=$B2>40");
    for condition in ["contains", "begins-with", "ends-with"] {
        assert_eq!(find("text", condition)["format"]["bgColor"], "#ffc7ce");
    }
    find("duplicate-values", "duplicate");
    find("duplicate-values", "unique");
    let top = find("top-bottom", "");
    assert_eq!((top["direction"].clone(), top["count"].clone(), top["percent"].clone()), ("bottom".into(), 2.into(), true.into()));
    let scale = find("color-scale", "");
    assert_eq!((scale["minColor"].clone(), scale["midColor"].clone(), scale["maxColor"].clone()), ("#f8696b".into(), "#ffeb84".into(), "#63be7b".into()));
    assert_eq!(scale["midThreshold"], serde_json::json!({"type": "percentile", "value": "50"}));
    assert_eq!(find("data-bar", "")["maxColor"], "#638ec6");
    let priorities: Vec<i64> = rules.iter().map(|r| r["priority"].as_i64().unwrap()).collect();
    assert_eq!(priorities, (0..rules.len() as i64).collect::<Vec<_>>());
}

#[test]
fn reads_hand_written_feature_parts_and_skips_what_native_cannot_hold() {
    let sheet = r#"<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><cols><col min="2" max="3" width="9" hidden="1"/></cols><sheetData>
        <row r="1" hidden="1" ht="30" customHeight="1"><c r="A1"><v>1</v></c></row></sheetData>
        <conditionalFormatting sqref="A1:A3 C1"><cfRule type="iconSet" priority="1"><iconSet iconSet="3Arrows"><cfvo type="percent" val="0"/></iconSet></cfRule>
          <cfRule type="aboveAverage" dxfId="0" priority="2"/><cfRule type="expression" dxfId="0" priority="3"><formula>MOD(ROW(),2)=0</formula></cfRule></conditionalFormatting>
        <dataValidations count="2"><dataValidation type="list" sqref="B1"><formula1>$D$1:$D$3</formula1></dataValidation>
          <dataValidation type="whole" operator="between" sqref="B2"><formula1>9</formula1><formula2>1</formula2></dataValidation></dataValidations>
        <hyperlinks><hyperlink ref="A1" r:id="rId1"/><hyperlink ref="A2" r:id="rId2"/><hyperlink ref="A3" location="Sheet1!A1"/></hyperlinks>
        <legacyDrawing r:id="rId3"/></worksheet>"#;
    let bytes = zip(&[
        ("xl/workbook.xml", r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!$A$1:$B$2</definedName><definedName name="Local" localSheetId="0">Sheet1!$A$1</definedName><definedName name="Rows">Sheet1!$2:$3</definedName><definedName name="Cols">Sheet1!$B:$C</definedName></definedNames></workbook>"#),
        ("xl/_rels/workbook.xml.rels", r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type=".../styles" Target="styles.xml"/></Relationships>"#),
        ("xl/styles.xml", r#"<styleSheet><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf/></cellXfs><dxfs><dxf><font><b/></font></dxf></dxfs></styleSheet>"#),
        ("xl/worksheets/sheet1.xml", sheet),
        ("xl/worksheets/_rels/sheet1.xml.rels", r#"<Relationships><Relationship Id="rId1" Type=".../hyperlink" Target="https://example.org/x" TargetMode="External"/><Relationship Id="rId2" Type=".../hyperlink" Target="mailto:a@b.c" TargetMode="External"/><Relationship Id="rId3" Type=".../comments" Target="../comments1.xml"/></Relationships>"#),
        ("xl/comments1.xml", r#"<comments><authors><author>A</author></authors><commentList><comment ref="B2" authorId="0"><text><r><rPr><b/></rPr><t>A:</t></r><r><t xml:space="preserve">
body</t></r><rPh><t>skip</t></rPh></text></comment><comment ref="C3" authorId="0"><text><t>[Threaded comment] placeholder</t></text></comment></commentList></comments>"#),
    ]);
    let file = native(bytes);
    let book = &file["workbook"];
    assert_eq!(book["hiddenColumns"][0]["columns"], serde_json::json!([1, 2]));
    assert_eq!(book["hidden"][0]["rows"], serde_json::json!([0]));
    assert!(book["sizes"].is_null(), "hidden row/column sizes are not kept");
    let rules = book["conditionalFormats"][0]["rules"].as_array().unwrap();
    assert_eq!(rules.len(), 1, "icon sets and above-average rules are skipped");
    assert_eq!(rules[0]["rule"]["formula"], "=MOD(ROW(),2)=0");
    assert_eq!(rules[0]["scope"]["additionalRanges"][0]["colStart"], 2);
    assert!(book["dataValidations"].is_null(), "range lists and inverted bounds are skipped");
    assert_eq!(book["hyperlinks"], serde_json::json!([{"sheet": 0, "row": 0, "col": 0, "url": "https://example.org/x"}]));
    assert_eq!(book["notes"], serde_json::json!([{"sheet": 0, "row": 1, "col": 1, "text": "A:\nbody"}]));
    let names: Vec<_> = book["namedRanges"].as_array().unwrap().iter().map(|n| (n["name"].clone(), n["target"]["range"].clone())).collect();
    assert_eq!(names, [("Rows".into(), serde_json::json!([1, 0, 2, 16383])), ("Cols".into(), serde_json::json!([0, 1, 1048575, 2]))]);
}

#[test]
fn reports_clean_import_on_basic_fixture_and_skipped_items_on_features_fixture() {
    let (_, basic_report) = einfach_xlsx::xlsx_to_native_with_report(
        std::fs::read("tests/fixtures/basic.xlsx").unwrap(),
        "basic",
    ).unwrap();
    assert!(basic_report.items.is_empty());
    assert_eq!(basic_report.summary, "");

    let (_, feat_report) = einfach_xlsx::xlsx_to_native_with_report(
        std::fs::read("tests/fixtures/features.xlsx").unwrap(),
        "features",
    ).unwrap();
    let kinds: Vec<_> = feat_report.items.iter().map(|i| (i.kind.as_str(), i.count)).collect();
    assert_eq!(kinds, [("definedNames", 1), ("hyperlinks", 1)]);
    assert_eq!(
        feat_report.summary,
        "Opened Excel workbook. Skipped: unsupported defined names, unsupported hyperlinks."
    );
}

#[test]
fn converts_1904_dates_and_reports_dropped_parts_from_edge_cases_fixture() {
    let (text, report) = einfach_xlsx::xlsx_to_native_with_report(
        std::fs::read("tests/fixtures/edge_cases.xlsx").unwrap(),
        "edge_cases",
    ).unwrap();
    let file: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(cell(&file, 0, "A2").unwrap()["value"], "Bold plain");
    assert_eq!(cell(&file, 0, "A4").unwrap()["value"], "Inline rich");
    // 1904 serial 39813 + 1462 = 41275 (2013-01-01 in 1900 system); time cell C3 (0.5) is untouched.
    assert_eq!(cell(&file, 0, "C2").unwrap()["value"], 41275.0);
    assert_eq!(cell(&file, 0, "C3").unwrap()["value"], 0.5);

    let kinds: Vec<&str> = report.items.iter().map(|i| i.kind.as_str()).collect();
    for expected in [
        "date1904", "charts", "threadedComments", "conditionalFormats", "dataValidations",
        "definedNames", "hyperlinks", "richText", "sheetProtection", "autoFilter",
        "outline", "printSetup", "macros",
    ] {
        assert!(kinds.contains(&expected), "expected {expected} in {kinds:?}");
    }
    assert!(report.summary.starts_with("Opened Excel workbook. Skipped: 1904 date system, charts, "));
}

#[test]
fn reports_drawings_pivots_theme_fonts_and_external_links() {
    let bytes = zip(&[
        ("xl/workbook.xml", r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="true"/><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>"#),
        ("xl/_rels/workbook.xml.rels", r#"<Relationships>
            <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/>
            <Relationship Id="rId2" Type=".../theme" Target="theme/theme1.xml"/>
            <Relationship Id="rId3" Type=".../externalLink" Target="externalLinks/externalLink1.xml"/>
            <Relationship Id="rId4" Type=".../pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/>
        </Relationships>"#),
        ("xl/theme/theme1.xml", r#"<theme><themeElements><fontScheme name="Custom"><majorFont><latin typeface="Roboto"/></majorFont><minorFont><latin typeface="Open Sans"/></minorFont></fontScheme></themeElements></theme>"#),
        ("xl/worksheets/sheet1.xml", r#"<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData><drawing r:id="rIdDrw"/></worksheet>"#),
        ("xl/worksheets/_rels/sheet1.xml.rels", r#"<Relationships>
            <Relationship Id="rIdDrw" Type=".../drawing" Target="../drawings/drawing1.xml"/>
            <Relationship Id="rIdPvt" Type=".../pivotTable" Target="../pivotTables/pivotTable1.xml"/>
        </Relationships>"#),
        ("xl/drawings/_rels/drawing1.xml.rels", r#"<Relationships><Relationship Id="rIdImg" Type=".../image" Target="../media/image1.png"/></Relationships>"#),
    ]);
    let (_, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Full").unwrap();
    let kinds: Vec<_> = report.items.iter().map(|i| (i.kind.as_str(), i.count)).collect();
    assert_eq!(kinds, [
        ("date1904", 1),
        ("drawings", 1),
        ("pivotTables", 1),
        ("themeFonts", 2),
        ("externalLinks", 1),
    ]);
}
