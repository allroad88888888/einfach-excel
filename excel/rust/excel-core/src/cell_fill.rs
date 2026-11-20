//! Native fill descriptors; their fallback background remains the separate base-color property.
use serde::{de::Error, Deserialize, Deserializer, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FillPattern {
    MediumGray,
    DarkGray,
    LightGray,
    DarkHorizontal,
    DarkVertical,
    DarkDown,
    DarkUp,
    DarkGrid,
    DarkTrellis,
    LightHorizontal,
    LightVertical,
    LightDown,
    LightUp,
    LightGrid,
    LightTrellis,
    Gray125,
    Gray0625,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum CellFill {
    Pattern {
        pattern: FillPattern,
        #[serde(deserialize_with = "rgb_color")]
        foreground: String,
    },
    LinearGradient {
        #[serde(deserialize_with = "finite_number")]
        degree: f64,
        #[serde(deserialize_with = "gradient_stops")]
        stops: Vec<GradientStop>,
    },
    PathGradient {
        #[serde(deserialize_with = "fraction")]
        left: f64,
        #[serde(deserialize_with = "fraction")]
        right: f64,
        #[serde(deserialize_with = "fraction")]
        top: f64,
        #[serde(deserialize_with = "fraction")]
        bottom: f64,
        #[serde(deserialize_with = "gradient_stops")]
        stops: Vec<GradientStop>,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GradientStop {
    #[serde(deserialize_with = "fraction")]
    pub position: f64,
    #[serde(deserialize_with = "rgb_color")]
    pub color: String,
}

fn finite_number<'de, D: Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    let value = f64::deserialize(deserializer)?;
    if !value.is_finite() { return Err(D::Error::custom("gradient number must be finite")); }
    Ok(value)
}

fn fraction<'de, D: Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    let value = finite_number(deserializer)?;
    if !(0.0..=1.0).contains(&value) {
        return Err(D::Error::custom("gradient position must be between 0 and 1"));
    }
    Ok(value)
}

// Bound allocation without sorting or discarding repeated positions from persisted facts.
fn gradient_stops<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<GradientStop>, D::Error> {
    struct Stops;
    impl<'de> serde::de::Visitor<'de> for Stops {
        type Value = Vec<GradientStop>;
        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("at most 256 gradient stops")
        }
        fn visit_seq<A: serde::de::SeqAccess<'de>>(self, mut sequence: A) -> Result<Self::Value, A::Error> {
            let mut result = Vec::new();
            while let Some(stop) = sequence.next_element()? {
                if result.len() == 256 { return Err(A::Error::custom("gradient has more than 256 stops")); }
                result.push(stop);
            }
            Ok(result)
        }
    }
    deserializer.deserialize_seq(Stops)
}

fn rgb_color<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.len() != 7 || !value.starts_with('#')
        || !value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit) {
        return Err(D::Error::custom("fill color must be #RRGGBB"));
    }
    Ok(value)
}
