#[derive(Clone, Debug, Deserialize)]
struct WorkbookImportCellJSON {
    sheet: usize,
    row: u32,
    col: u32,
    #[serde(default)]
    kind: BulkImportKindJSON,
    #[serde(default)]
    value: Option<BulkImportValueJSON>,
}

#[derive(Clone, Debug, Serialize)]
struct WorkbookImportIssueJSON {
    sheet: usize,
    row: u32,
    col: u32,
    kind: String,
    code: String,
    message: String,
}

#[derive(Clone, Debug, Default, Serialize)]
struct WorkbookImportStatsJSON {
    accepted: u32,
    formulas: u32,
    #[serde(rename = "rejectedFormulas")]
    rejected_formulas: u32,
    cleared: u32,
    errors: u32,
    issues: Vec<WorkbookImportIssueJSON>,
}

impl WorkbookImportStatsJSON {
    fn push_issue(&mut self, cell: &WorkbookImportCellJSON, kind: &str, code: &str, message: &str) {
        self.issues.push(WorkbookImportIssueJSON {
            sheet: cell.sheet,
            row: cell.row,
            col: cell.col,
            kind: kind.to_string(),
            code: code.to_string(),
            message: message.to_string(),
        });
    }
}

// === STORAGE_PRIMARY Phase 6.2 wire (`bulk_install_workbook`) ===
//
// One entry per sheet; `primitives` / `formulas` are arrays of
// `[addr, value]` pairs that deserialize DIRECTLY into the
// `HashMap<CellAddress, _>` maps `Workbook::install_workbook_bulk`
// consumes — no intermediate `Vec<ImportCellWire>`, no per-cell engine
// calls. The addr string accepts two encodings:
//
//   - `"R:C"` — zero-based row/col pair (e.g. `"0:0"` = A1). Matches
//     the zero-based row/col fields of the legacy `bulk_import_cells`
//     wire, so the worker-side migration (Phase 6.3) is a
//     `` `${row}:${col}` `` template away.
//   - A1 form (e.g. `"B2"`) — convenience for hand-written payloads
//     and tests.
fn parse_wire_addr(s: &str) -> Option<CellAddress> {
    if let Some((row, col)) = s.split_once(':') {
        if let (Ok(row), Ok(col)) = (row.parse::<u32>(), col.parse::<u32>()) {
            return Some(CellAddress::new(row, col));
        }
    }
    CellAddress::parse(s)
}

/// Primitive value wire for the storage-primary install path. Same
/// JS-type-driven encoding as `BulkImportValueJSON` (number → Number,
/// string → Text, boolean → Boolean) minus the side-channel `kind`
/// string; error cells ride as `{ error: "#DIV/0!" }` objects since
/// there is no `kind: "error"` discriminator anymore.
#[derive(Clone, Debug)]
enum PrimitiveWireJSON {
    Number(f64),
    Boolean(bool),
    Text(String),
    Error(String),
    /// `null` / `undefined` — treated as "absent": skipped at install.
    Null,
}

impl PrimitiveWireJSON {
    /// Convert to an engine `Value`. `None` means "skip this entry":
    /// explicit nulls and non-finite numbers (NaN / ±Infinity cannot be
    /// represented as a cell number; the legacy wire rejected them too).
    fn into_value(self) -> Option<Value> {
        match self {
            PrimitiveWireJSON::Number(n) if n.is_finite() => Some(Value::Number(n)),
            PrimitiveWireJSON::Number(_) => None,
            PrimitiveWireJSON::Boolean(b) => Some(Value::Boolean(b)),
            PrimitiveWireJSON::Text(s) => Some(Value::Text(s)),
            PrimitiveWireJSON::Error(s) => Some(Value::Error(value_error_from_display(&s))),
            PrimitiveWireJSON::Null => None,
        }
    }
}

impl<'de> Deserialize<'de> for PrimitiveWireJSON {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: de::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = PrimitiveWireJSON;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a number, string, boolean, null, or { error } object")
            }

            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Number(v))
            }

            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Number(v as f64))
            }

            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Number(v as f64))
            }

            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Boolean(v))
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Text(v.to_string()))
            }

            fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Text(v))
            }

            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Null)
            }

            fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(PrimitiveWireJSON::Null)
            }

            fn visit_some<D2>(self, deserializer: D2) -> Result<Self::Value, D2::Error>
            where
                D2: de::Deserializer<'de>,
            {
                deserializer.deserialize_any(self)
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: de::MapAccess<'de>,
            {
                let mut error: Option<String> = None;
                while let Some(key) = map.next_key::<String>()? {
                    if key == "error" {
                        error = Some(map.next_value::<String>()?);
                    } else {
                        let _ = map.next_value::<de::IgnoredAny>()?;
                    }
                }
                match error {
                    Some(e) => Ok(PrimitiveWireJSON::Error(e)),
                    None => Err(de::Error::custom(
                        "object primitive must carry an `error` key",
                    )),
                }
            }
        }

        deserializer.deserialize_any(Visitor)
    }
}
