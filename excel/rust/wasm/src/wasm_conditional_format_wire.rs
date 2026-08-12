// Serde wire conversion for workbook-owned conditional-format configuration.

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConditionalFormatRangeJSON {
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ConditionalFormatScopeJSON {
    range: ConditionalFormatRangeJSON,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConditionalFormatRuleEntryJSON {
    id: String,
    scope: ConditionalFormatScopeJSON,
    priority: i64,
    rule: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConditionalFormatConfigSnapshotJSON {
    sheet: u32,
    revision: u64,
    rules: Vec<ConditionalFormatRuleEntryJSON>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetConditionalFormatRuleJSON {
    revision: u64,
    #[serde(default)]
    rule_id: Option<String>,
    scope: ConditionalFormatScopeJSON,
    #[serde(default)]
    priority: Option<i64>,
    rule: serde_json::Value,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveConditionalFormatRuleJSON {
    revision: u64,
    rule_id: String,
}

impl ConditionalFormatRuleEntryJSON {
    fn from_entry(entry: &ConditionalFormatRuleEntry) -> Result<Self, String> {
        let rule = serde_json::from_str(&entry.rule_json)
            .map_err(|error| format!("invalid stored conditional-format rule: {error}"))?;
        Ok(Self {
            id: entry.id.clone(),
            scope: ConditionalFormatScopeJSON {
                range: ConditionalFormatRangeJSON {
                    row_start: entry.row_start,
                    row_end: entry.row_end,
                    col_start: entry.col_start,
                    col_end: entry.col_end,
                },
            },
            priority: entry.priority,
            rule,
        })
    }

    fn into_entry(self) -> Result<ConditionalFormatRuleEntry, String> {
        let range = self.scope.range;
        if range.row_end < range.row_start || range.col_end < range.col_start {
            return Err("conditional-format range must be normalized".to_string());
        }
        let rule_json = serde_json::to_string(&self.rule)
            .map_err(|error| format!("invalid conditional-format rule: {error}"))?;
        Ok(ConditionalFormatRuleEntry {
            id: self.id,
            row_start: range.row_start,
            row_end: range.row_end,
            col_start: range.col_start,
            col_end: range.col_end,
            priority: self.priority,
            rule_json,
        })
    }
}

impl ConditionalFormatConfigSnapshotJSON {
    fn from_snapshot(snapshot: &ConditionalFormatConfigSnapshot) -> Result<Self, String> {
        let rules = snapshot
            .rules
            .iter()
            .map(ConditionalFormatRuleEntryJSON::from_entry)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            sheet: snapshot.sheet as u32,
            revision: snapshot.revision,
            rules,
        })
    }

    fn into_snapshot(self) -> Result<ConditionalFormatConfigSnapshot, String> {
        let rules = self
            .rules
            .into_iter()
            .map(ConditionalFormatRuleEntryJSON::into_entry)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ConditionalFormatConfigSnapshot {
            sheet: self.sheet as usize,
            revision: self.revision,
            rules,
        })
    }
}

impl SetConditionalFormatRuleJSON {
    fn into_entry(self, id: String) -> Result<ConditionalFormatRuleEntry, String> {
        ConditionalFormatRuleEntryJSON {
            id,
            scope: self.scope,
            priority: self.priority.unwrap_or(0),
            rule: self.rule,
        }
        .into_entry()
    }
}
