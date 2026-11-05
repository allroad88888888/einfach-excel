use serde_json::{json, Value};

#[test]
fn dimensions_and_per_sheet_default_fonts_roundtrip_without_dense_cells() {
    let original = json!({
        "format":"einfach-workbook", "version":1, "title":"Defaults",
        "canvases":[{"rowCount":1048576,"colCount":16384},{"rowCount":100,"colCount":10}],
        "workbook":{"version":1,"sheets":[
            {"idx":0,"name":"Large","defaults":{"rowHeight":36,"colWidth":160,"fontSize":18}},
            {"idx":1,"name":"Small","defaults":{"rowHeight":24,"colWidth":96,"fontSize":11}}],
            "cells":[{"sheet":0,"addr":"A1","row":0,"col":0,"kind":"text","value":"Default"},
                {"sheet":0,"addr":"B1","row":0,"col":1,"kind":"text","value":"Explicit"}],
            "formats":[{"sheet":0,"startRow":0,"startCol":0,"endRow":100,"endCol":10,
                "cellStyles":[{"addr":"B1","format":{"fontSize":11}}]}],
            "sizes":[{"sheet":0,"startRow":0,"startCol":0,"endRow":100,"endCol":10,
                "rowHeights":[{"rowIndex":1,"heightPx":48}],"colWidths":[{"colIndex":1,"widthPx":200}]}]
        }
    });
    let bytes = einfach_xlsx::native_to_xlsx(&original.to_string()).unwrap();
    let restored: Value = serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "Defaults").unwrap()).unwrap();
    let wb = &restored["workbook"];
    assert_eq!(wb["sheets"], original["workbook"]["sheets"]);
    assert_eq!(wb["cells"].as_array().unwrap().len(), 2);
    assert_eq!(wb["sizes"][0]["rowHeights"][0]["heightPx"], 48);
    assert_eq!(wb["sizes"][0]["colWidths"][0]["widthPx"], 200);
    let cells = wb["formats"][0]["cellStyles"].as_array().unwrap();
    assert_eq!(cells.iter().find(|cell| cell["addr"] == "B1").unwrap()["format"]["fontSize"], 11);
}
