// Shared shape for worksheet coordinates at the WASM boundary.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CellCoordinateJSON {
    row: u32,
    col: u32,
}
