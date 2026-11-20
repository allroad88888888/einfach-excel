use std::io::{Cursor, Read, Write};

use serde_json::{json, Value};
use zip::write::SimpleFileOptions;

fn zip_parts(parts: &[(&str, &str)]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (path, body) in parts {
        writer.start_file(*path, SimpleFileOptions::default()).unwrap();
        writer.write_all(body.as_bytes()).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

#[test]
fn imports_threaded_comments_with_persons_mentions_replies_and_resolved_state() {
    // Emoji 👩‍💻 occupies 5 UTF-16 code units; "@👩‍💻 Bob" = 1 + 5 + 1 + 3 = 10 UTF-16 units.
    let bytes = zip_parts(&[
        (
            "xl/workbook.xml",
            r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Review" sheetId="1" r:id="rId1"/></sheets></workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<Relationships>
                <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/>
                <Relationship Id="rIdPersons" Type="http://schemas.microsoft.com/office/2017/10/relationships/person" Target="persons/person.xml"/>
            </Relationships>"#,
        ),
        (
            "xl/persons/person.xml",
            r#"<personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">
                <person displayName="Alice Chen" id="{11111111-1111-1111-1111-111111111111}"/>
                <person displayName="👩‍💻 Bob" id="{22222222-2222-2222-2222-222222222222}"/>
            </personList>"#,
        ),
        (
            "xl/worksheets/sheet1.xml",
            r#"<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData><legacyDrawing r:id="rIdVml"/></worksheet>"#,
        ),
        (
            "xl/worksheets/_rels/sheet1.xml.rels",
            r#"<Relationships>
                <Relationship Id="rIdTc" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"/>
                <Relationship Id="rIdLegacy" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>
            </Relationships>"#,
        ),
        (
            "xl/threadedComments/threadedComment1.xml",
            r#"<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">
                <threadedComment ref="A1" dT="2026-03-10T09:00:00.000Z" personId="{11111111-1111-1111-1111-111111111111}" id="{aaaa}" done="1">
                    <text>@👩‍💻 Bob Please verify Q1 total</text>
                    <mentions><mention mentionpersonId="{22222222-2222-2222-2222-222222222222}" mentionId="{m1}" startIndex="0" length="10"/></mentions>
                </threadedComment>
                <threadedComment dT="2026-03-10T09:05:00.500Z" personId="{22222222-2222-2222-2222-222222222222}" id="{bbbb}" parentId="{AAAA}">
                    <text>@Alice Chen Verified and closed</text>
                </threadedComment>
                <threadedComment ref="B2" dT="2026-03-10T10:00:00+08:00" personId="{unknown}" id="{cccc}">
                    <text>Open thread without person match</text>
                </threadedComment>
            </ThreadedComments>"#,
        ),
        (
            "xl/comments1.xml",
            r#"<comments><authors><author>tc</author></authors><commentList>
                <comment ref="A1" authorId="0"><text><t>[Threaded comment] Excel compatibility placeholder</t></text></comment>
                <comment ref="C3" authorId="0"><text><t>Real legacy note</t></text></comment>
            </commentList></comments>"#,
        ),
    ]);

    let (text, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Threaded").unwrap();
    assert!(report.items.is_empty(), "unexpected report items: {:?}", report.items);

    let file: Value = serde_json::from_str(&text).unwrap();
    let comments = file["workbook"]["comments"].as_array().unwrap();
    assert_eq!(comments.len(), 2);

    let t1 = &comments[0];
    assert_eq!((t1["sheet"].as_u64(), t1["row"].as_u64(), t1["col"].as_u64()), (Some(0), Some(0), Some(0)));
    assert_eq!(t1["thread"]["resolved"], true);
    let e1 = t1["thread"]["entries"].as_array().unwrap();
    assert_eq!(e1.len(), 3);
    assert_eq!(e1[0]["author"], "Alice Chen");
    assert_eq!(e1[0]["body"], "Please verify Q1 total");
    assert_eq!(e1[1]["author"], "👩‍💻 Bob");
    assert_eq!(e1[1]["body"], "Verified and closed");
    assert!(e1[1]["createdAt"].as_i64().unwrap() > e1[0]["createdAt"].as_i64().unwrap());
    assert_eq!(e1[2]["kind"], "resolve");
    assert!(e1[2].get("body").is_none());

    let t2 = &comments[1];
    assert_eq!((t2["row"].as_u64(), t2["col"].as_u64()), (Some(1), Some(1)));
    assert_eq!(t2["thread"]["resolved"], false);
    assert_eq!(t2["thread"]["entries"][0]["author"], "Author");
    assert_eq!(t2["thread"]["entries"][0]["body"], "Open thread without person match");

    assert_eq!(
        file["workbook"]["notes"],
        json!([{"sheet": 0, "row": 2, "col": 2, "text": "Real legacy note"}])
    );
}

#[test]
fn internal_hyperlinks_roundtrip_with_quoted_sheets_ranges_names_and_display() {
    let bytes = zip_parts(&[
        (
            "xl/workbook.xml",
            r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                <sheets>
                    <sheet name="Overview" sheetId="1" r:id="rId1"/>
                    <sheet name="Sales Orders" sheetId="2" r:id="rId2"/>
                    <sheet name="Bob's [2026]" sheetId="3" r:id="rId3"/>
                </sheets>
                <definedNames><definedName name="SampleAmounts">'Sales Orders'!$B$2:$B$10</definedName></definedNames>
            </workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<Relationships>
                <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/>
                <Relationship Id="rId2" Type=".../worksheet" Target="worksheets/sheet2.xml"/>
                <Relationship Id="rId3" Type=".../worksheet" Target="worksheets/sheet3.xml"/>
            </Relationships>"#,
        ),
        (
            "xl/worksheets/sheet1.xml",
            r#"<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Sales</t></is></c></row></sheetData>
                <hyperlinks>
                    <hyperlink ref="A1" location="'Sales Orders'!B5:D10" display="Sales"/>
                    <hyperlink ref="A2" location="'Bob''s [2026]'!$A$1:$C$5" display="Jump to Bob"/>
                    <hyperlink ref="A3" location="SampleAmounts"/>
                    <hyperlink ref="A4" location="C10"/>
                    <hyperlink ref="A5" location="Overview!A:C"/>
                </hyperlinks>
            </worksheet>"#,
        ),
        ("xl/worksheets/sheet2.xml", r#"<worksheet><sheetData/></worksheet>"#),
        ("xl/worksheets/sheet3.xml", r#"<worksheet><sheetData/></worksheet>"#),
    ]);

    let (text, import_report) =
        einfach_xlsx::xlsx_to_native_with_report(bytes, "InternalLinks").unwrap();
    assert_eq!(
        import_report.items.iter().map(|i| (i.kind.as_str(), i.count)).collect::<Vec<_>>(),
        [("hyperlinks", 1)]
    );

    let native: Value = serde_json::from_str(&text).unwrap();
    // "Bob's [2026]" is cleaned to "Bob's 2026" on import, and the internal hyperlink rewrites accordingly!
    assert_eq!(native["workbook"]["sheets"][2]["name"], "Bob's 2026");
    assert_eq!(
        native["workbook"]["hyperlinks"],
        json!([
            {"sheet": 0, "row": 0, "col": 0, "url": "#'Sales Orders'!B5:D10"},
            {"sheet": 0, "row": 1, "col": 0, "url": "#'Bob''s 2026'!$A$1:$C$5"},
            {"sheet": 0, "row": 2, "col": 0, "url": "#SampleAmounts"},
            {"sheet": 0, "row": 3, "col": 0, "url": "#C10"},
        ])
    );
    // Empty cell A2 received its `<hyperlink display="Jump to Bob"/>` label.
    let a2 = native["workbook"]["cells"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["sheet"] == 0 && c["addr"] == "A2")
        .unwrap();
    assert_eq!(a2["value"], "Jump to Bob");

    let (exported, export_report) =
        einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(export_report.items.is_empty(), "{:?}", export_report.items);

    let mut archive = zip::ZipArchive::new(Cursor::new(exported.clone())).unwrap();
    assert!(
        archive.by_name("xl/worksheets/_rels/sheet1.xml.rels").is_err(),
        "internal hyperlinks must not emit external worksheet relationships"
    );
    let mut sheet1_xml = String::new();
    archive.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut sheet1_xml).unwrap();
    assert!(sheet1_xml.contains(r#"location="'Sales Orders'!B5:D10" display="Sales""#));

    let (restored_text, reimport_report) =
        einfach_xlsx::xlsx_to_native_with_report(exported, "InternalLinks").unwrap();
    assert!(reimport_report.items.is_empty());
    let restored: Value = serde_json::from_str(&restored_text).unwrap();
    assert_eq!(restored["workbook"]["hyperlinks"], native["workbook"]["hyperlinks"]);
}
