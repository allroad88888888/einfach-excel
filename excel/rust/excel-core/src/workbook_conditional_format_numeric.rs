//! 数值条件规则的原生校验与判定；不读取 UI 状态，不改基础格式。
use crate::cell_style::CellStyle;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NumericRuleJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    operator: Operator,
    value: Operand,
    #[serde(rename = "value2")]
    value2: Option<Operand>,
    format: Highlight,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Operator {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
    Between,
    NotBetween,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Operand {
    Text(String),
    Number(f64),
}

impl Operand {
    fn number(&self) -> Result<f64, &'static str> {
        let number = match self {
            Self::Text(text) => text
                .trim()
                .parse::<f64>()
                .map_err(|_| "Enter a finite number.")?,
            Self::Number(number) => *number,
        };
        if number.is_finite() {
            Ok(number)
        } else {
            Err("Enter a finite number.")
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Highlight {
    #[serde(rename = "fgColor", alias = "color")]
    color: Option<String>,
    #[serde(rename = "bgColor", alias = "background")]
    background: Option<String>,
    bold: Option<bool>,
    italic: Option<bool>,
    underline: Option<bool>,
}

pub(crate) struct NumericRule {
    operator: Operator,
    value: f64,
    value2: Option<f64>,
    pub(crate) style: CellStyle,
    pub(crate) enabled: bool,
}

fn enabled_by_default() -> bool { true }

impl NumericRule {
    /// JSON 只在规则写入或每次窗口读取时解码一次，不在每个 cell 内解析。
    pub(crate) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: NumericRuleJson = serde_json::from_str(json)
            .map_err(|_| "Use a numeric cell-value rule with supported highlight fields.")?;
        if rule.kind != "cell-value" {
            return Err("Only numeric cell-value rules can be edited here.");
        }
        let value = rule.value.number()?;
        let value2 = rule.value2.as_ref().map(Operand::number).transpose()?;
        let between = matches!(rule.operator, Operator::Between | Operator::NotBetween);
        if between && !value2.is_some_and(|upper| upper >= value) {
            return Err("The upper bound must be a number at least as large as the lower bound.");
        }
        if !between && value2.is_some() {
            return Err("This comparison accepts only one number.");
        }
        for color in [&rule.format.color, &rule.format.background]
            .into_iter()
            .flatten()
        {
            if color.len() != 7
                || !color.starts_with('#')
                || !color[1..].bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err("Highlight colors must use #RRGGBB.");
            }
        }
        let style = CellStyle {
            color: rule.format.color.map(Some),
            background: rule.format.background.map(Some),
            bold: rule.format.bold,
            italic: rule.format.italic,
            underline: rule.format.underline,
            ..CellStyle::default()
        };
        if style.is_empty() {
            return Err("Choose at least one highlight property.");
        }
        Ok(Self {
            enabled: rule.enabled,
            operator: rule.operator,
            value,
            value2,
            style,
        })
    }

    /// 空白、文本、布尔值、错误由调用方排除；不把空白强转成零。
    pub(crate) fn matches(&self, number: f64) -> bool {
        if !self.enabled || !number.is_finite() {
            return false;
        }
        match self.operator {
            Operator::Eq => number == self.value,
            Operator::Ne => number != self.value,
            Operator::Gt => number > self.value,
            Operator::Gte => number >= self.value,
            Operator::Lt => number < self.value,
            Operator::Lte => number <= self.value,
            Operator::Between => number >= self.value && number <= self.value2.unwrap(),
            Operator::NotBetween => number < self.value || number > self.value2.unwrap(),
        }
    }
}
