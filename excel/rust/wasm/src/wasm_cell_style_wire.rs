// 稀疏 CellStyle 与边框值的 wire 转换。

fn style_scope(value: &str) -> Result<StyleScope, JsValue> {
    match value {
        "cell" => Ok(StyleScope::Cell),
        "row" => Ok(StyleScope::Row),
        "column" => Ok(StyleScope::Column),
        _ => Err(JsValue::from_str(&format!("invalid style scope: {value}"))),
    }
}

impl CellFormatJSON {
    fn from_style(style: &CellStyle) -> Self {
        Self {
            number_format: style
                .number_format
                .as_ref()
                .map(NumberFormatJSON::from_number_format),
            bold: style.bold,
            italic: style.italic,
            align: style.align.map(|value| match value {
                Align::Default => "default".into(),
                Align::Left => "left".into(),
                Align::Center => "center".into(),
                Align::Right => "right".into(),
            }),
            font_size: style.font_size,
            fg_color: style.color.clone(),
            bg_color: style.background.clone(),
            font_family: style.font_family.clone(),
            underline: style.underline,
            strikethrough: style.strikethrough,
            wrap: style.wrap_text,
            indent: style.indent,
            vertical_align: style.vertical_align.map(|value| match value {
                VerticalAlign::Default => "default".into(),
                VerticalAlign::Top => "top".into(),
                VerticalAlign::Center => "center".into(),
                VerticalAlign::Bottom => "bottom".into(),
                VerticalAlign::Justify => "justify".into(),
                VerticalAlign::Distributed => "distributed".into(),
            }),
            rotation: style.rotation.map(|value| match value {
                Rotation::None => RotationJSON::Degrees(0),
                Rotation::Degrees(degrees) => RotationJSON::Degrees(degrees),
                Rotation::Vertical => RotationJSON::Vertical("vertical".into()),
            }),
            borders: style.borders.as_ref().map(CellBordersJSON::from_borders),
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
        (borders != &CellBorders::default()).then(|| CellBordersJSON {
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
        Self {
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
