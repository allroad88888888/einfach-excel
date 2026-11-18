//! Native fill descriptors accepted by the independent XLSX converter.
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FillPattern {
    MediumGray, DarkGray, LightGray, DarkHorizontal, DarkVertical, DarkDown, DarkUp,
    DarkGrid, DarkTrellis, LightHorizontal, LightVertical, LightDown, LightUp,
    LightGrid, LightTrellis, Gray125, Gray0625,
}

impl FillPattern {
    pub fn from_xml(value: &str) -> Option<Self> {
        serde_json::from_value(serde_json::Value::String(value.into())).ok()
    }

    pub fn xml(self) -> String {
        serde_json::to_value(self).expect("pattern enum").as_str().expect("pattern name").into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum CellFill {
    Pattern {
        pattern: FillPattern,
        #[serde(deserialize_with = "rgb_color")]
        foreground: String,
    },
}

fn rgb_color<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.len() != 7 || !value.starts_with('#') || !value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit) {
        return Err(serde::de::Error::custom("Fill color must be #RRGGBB"));
    }
    Ok(value)
}

/// Missing inherits the lower layer; explicit null clears it.
pub fn deserialize_override<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where D: Deserializer<'de>, T: Deserialize<'de> {
    Option::<T>::deserialize(deserializer).map(Some)
}
