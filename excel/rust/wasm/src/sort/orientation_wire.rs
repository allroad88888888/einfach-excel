#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum SortOrientationWireJSON {
    #[default]
    TopToBottom,
    LeftToRight,
}

impl SortOrientationWireJSON {
    fn coordinate(self, column: Option<u32>, row: Option<u32>) -> Result<u32, String> {
        match (self, column, row) {
            (Self::TopToBottom, Some(column), None) => Ok(column),
            (Self::LeftToRight, None, Some(row)) => Ok(row),
            _ => Err("Use column keys for vertical sorting and row keys for horizontal sorting.".into()),
        }
    }
}
