/// Wire format for `CellFormat` over wasm-bindgen. Mirrors `CellFormat` /
/// `NumberFormat` / `Align` but tagged-by-string so the JS side can build
/// these from plain object literals (`{ numberFormat: { kind: 'percent',
/// digits: 0 }, bold: true }`) without learning Rust's serde tags.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct CellFormatJSON {
    #[serde(
        default,
        rename = "numberFormat",
        skip_serializing_if = "Option::is_none"
    )]
    number_format: Option<NumberFormatJSON>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    align: Option<String>,
    #[serde(default, rename = "fontSize", skip_serializing_if = "Option::is_none")]
    font_size: Option<u32>,
    #[serde(
        default,
        rename = "fgColor",
        alias = "color",
        skip_serializing_if = "Option::is_none"
    )]
    fg_color: Option<String>,
    #[serde(
        default,
        rename = "bgColor",
        alias = "background",
        skip_serializing_if = "Option::is_none"
    )]
    bg_color: Option<String>,
    #[serde(
        default,
        rename = "fontFamily",
        skip_serializing_if = "Option::is_none"
    )]
    font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    strikethrough: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    wrap: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    indent: Option<u8>,
    #[serde(
        default,
        rename = "verticalAlign",
        skip_serializing_if = "Option::is_none"
    )]
    vertical_align: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rotation: Option<RotationJSON>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    borders: Option<CellBordersJSON>,
}

/// Wire format for cell rotation. JS sends `number | 'vertical'`; the
/// untagged enum lets serde pick the matching variant automatically.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum RotationJSON {
    Vertical(String),
    Degrees(i16),
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct CellBordersJSON {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    top: Option<BorderSpecJSON>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    right: Option<BorderSpecJSON>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bottom: Option<BorderSpecJSON>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    left: Option<BorderSpecJSON>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct BorderSpecJSON {
    /// One of "none" | "thin" | "medium" | "thick" | "dashed" | "dotted" | "double".
    style: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    color: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct NumberFormatJSON {
    /// One of "general" | "number" | "decimal" | "percent" | "percentage" | "currency" | "date" | "custom".
    kind: String,
    #[serde(default)]
    digits: Option<u8>,
    /// Currency symbol — used when `kind == "currency"`.
    #[serde(default)]
    symbol: Option<String>,
    /// Pattern — used when `kind == "date"` or `kind == "custom"`.
    #[serde(default)]
    pattern: Option<String>,
    /// Render thousands separators for `decimal`.
    #[serde(default)]
    thousands: Option<bool>,
}

impl CellFormatJSON {
    fn into_format(self) -> CellFormat {
        let number_format = self
            .number_format
            .map(|nf| nf.into_number_format())
            .unwrap_or_default();
        let align = match self.align.as_deref() {
            Some("left") => Align::Left,
            Some("center") => Align::Center,
            Some("right") => Align::Right,
            _ => Align::Default,
        };
        let vertical_align = match self.vertical_align.as_deref() {
            Some("top") => VerticalAlign::Top,
            Some("center") => VerticalAlign::Center,
            Some("bottom") => VerticalAlign::Bottom,
            Some("justify") => VerticalAlign::Justify,
            Some("distributed") => VerticalAlign::Distributed,
            _ => VerticalAlign::Default,
        };
        let rotation = match self.rotation {
            Some(RotationJSON::Vertical(ref s)) if s == "vertical" => Rotation::Vertical,
            Some(RotationJSON::Degrees(d)) => Rotation::Degrees(d),
            _ => Rotation::None,
        };
        CellFormat {
            number_format,
            bold: self.bold.unwrap_or(false),
            italic: self.italic.unwrap_or(false),
            align,
            font_size: self.font_size,
            color: self.fg_color,
            background: self.bg_color,
            font_family: self.font_family,
            underline: self.underline.unwrap_or(false),
            strikethrough: self.strikethrough.unwrap_or(false),
            wrap_text: self.wrap.unwrap_or(false),
            indent: self.indent.unwrap_or(0),
            vertical_align,
            rotation,
            borders: self
                .borders
                .map(CellBordersJSON::into_borders)
                .unwrap_or_default(),
        }
    }

    fn from_format(fmt: &CellFormat) -> Self {
        CellFormatJSON {
            number_format: Some(NumberFormatJSON::from_number_format(&fmt.number_format)),
            bold: Some(fmt.bold),
            italic: Some(fmt.italic),
            align: Some(match fmt.align {
                Align::Default => "default".into(),
                Align::Left => "left".into(),
                Align::Center => "center".into(),
                Align::Right => "right".into(),
            }),
            font_size: fmt.font_size,
            fg_color: fmt.color.clone(),
            bg_color: fmt.background.clone(),
            font_family: fmt.font_family.clone(),
            underline: if fmt.underline { Some(true) } else { None },
            strikethrough: if fmt.strikethrough { Some(true) } else { None },
            wrap: if fmt.wrap_text { Some(true) } else { None },
            indent: if fmt.indent > 0 {
                Some(fmt.indent)
            } else {
                None
            },
            vertical_align: match fmt.vertical_align {
                VerticalAlign::Default => None,
                VerticalAlign::Top => Some("top".into()),
                VerticalAlign::Center => Some("center".into()),
                VerticalAlign::Bottom => Some("bottom".into()),
                VerticalAlign::Justify => Some("justify".into()),
                VerticalAlign::Distributed => Some("distributed".into()),
            },
            rotation: match fmt.rotation {
                Rotation::None => None,
                Rotation::Degrees(d) => Some(RotationJSON::Degrees(d)),
                Rotation::Vertical => Some(RotationJSON::Vertical("vertical".into())),
            },
            borders: CellBordersJSON::from_borders(&fmt.borders),
        }
    }
}

impl CellBordersJSON {
    fn into_borders(self) -> CellBorders {
        CellBorders {
            top: self.top.map(BorderSpecJSON::into_spec),
            right: self.right.map(BorderSpecJSON::into_spec),
            bottom: self.bottom.map(BorderSpecJSON::into_spec),
            left: self.left.map(BorderSpecJSON::into_spec),
        }
    }

    fn from_borders(borders: &CellBorders) -> Option<Self> {
        if borders == &CellBorders::default() {
            return None;
        }
        Some(CellBordersJSON {
            top: borders.top.as_ref().map(BorderSpecJSON::from_spec),
            right: borders.right.as_ref().map(BorderSpecJSON::from_spec),
            bottom: borders.bottom.as_ref().map(BorderSpecJSON::from_spec),
            left: borders.left.as_ref().map(BorderSpecJSON::from_spec),
        })
    }
}

impl BorderSpecJSON {
    fn into_spec(self) -> BorderSpec {
        let style = match self.style.as_str() {
            "thin" => BorderStyle::Thin,
            "medium" => BorderStyle::Medium,
            "thick" => BorderStyle::Thick,
            "dashed" => BorderStyle::Dashed,
            "dotted" => BorderStyle::Dotted,
            "double" => BorderStyle::Double,
            _ => BorderStyle::None,
        };
        BorderSpec {
            style,
            color: self.color,
        }
    }

    fn from_spec(spec: &BorderSpec) -> Self {
        BorderSpecJSON {
            style: match spec.style {
                BorderStyle::None => "none".into(),
                BorderStyle::Thin => "thin".into(),
                BorderStyle::Medium => "medium".into(),
                BorderStyle::Thick => "thick".into(),
                BorderStyle::Dashed => "dashed".into(),
                BorderStyle::Dotted => "dotted".into(),
                BorderStyle::Double => "double".into(),
            },
            color: spec.color.clone(),
        }
    }
}
