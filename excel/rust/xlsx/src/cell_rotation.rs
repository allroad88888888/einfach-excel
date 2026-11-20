//! 单元格文字旋转：原生 `-90..=90` 度或 `"vertical"` 与 XLSX `textRotation`（0..=180, 255）互转。

use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CellRotation {
    Degrees(i16),
    Vertical,
}

impl CellRotation {
    /// XLSX `<alignment textRotation="..."/>` → 原生旋转。
    /// 0 表示不旋转；1..=90 为逆时针正角度；91..=180 为顺时针负角度 `90 - val`；255 为竖排文字。
    pub fn from_xlsx(val: u32) -> Option<Self> {
        match val {
            1..=90 => Some(Self::Degrees(val as i16)),
            91..=180 => Some(Self::Degrees(90 - val as i16)),
            255 => Some(Self::Vertical),
            _ => None,
        }
    }

    /// 原生旋转 → XLSX `textRotation` 属性值。
    pub fn to_xlsx(self) -> u32 {
        match self {
            Self::Degrees(d @ 1..=90) => d as u32,
            Self::Degrees(d @ -90..=-1) => (90 - i32::from(d)) as u32,
            Self::Degrees(_) => 0,
            Self::Vertical => 255,
        }
    }
}

impl Serialize for CellRotation {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Degrees(d) => serializer.serialize_i16(*d),
            Self::Vertical => serializer.serialize_str("vertical"),
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum RawRotation {
    Degrees(i32),
    Text(String),
}

pub fn deserialize_option<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<CellRotation>, D::Error> {
    let raw = Option::<RawRotation>::deserialize(deserializer)?;
    match raw {
        None => Ok(None),
        Some(RawRotation::Degrees(0)) => Ok(None),
        Some(RawRotation::Degrees(d)) if (-90..=90).contains(&d) => {
            Ok(Some(CellRotation::Degrees(d as i16)))
        }
        Some(RawRotation::Text(s)) if s == "vertical" => Ok(Some(CellRotation::Vertical)),
        Some(RawRotation::Degrees(d)) => {
            Err(serde::de::Error::custom(format!("unsupported rotation degrees: {d}")))
        }
        Some(RawRotation::Text(s)) => {
            Err(serde::de::Error::custom(format!("unsupported rotation mode: {s}")))
        }
    }
}
