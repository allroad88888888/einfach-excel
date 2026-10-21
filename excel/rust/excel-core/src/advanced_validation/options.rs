//! 用户提示仅包含纯文本；确认级别不改变规则定义或保护权限。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ValidationErrorStyle {
    #[default]
    Stop,
    Warning,
    Information,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationMessage {
    pub title: String,
    pub message: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationErrorAlert {
    pub style: ValidationErrorStyle,
    pub title: String,
    pub message: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvancedValidationOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_message: Option<ValidationMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_alert: Option<ValidationErrorAlert>,
}

impl AdvancedValidationOptions {
    pub fn validate(&self) -> Result<(), &'static str> {
        let mut messages = Vec::new();
        if let Some(input) = &self.input_message {
            messages.push((&input.title, &input.message));
        }
        if let Some(error) = &self.error_alert {
            messages.push((&error.title, &error.message));
        }
        for (title, message) in messages {
            if title.contains('\0') || message.contains('\0') {
                return Err("Validation messages cannot contain a null character.");
            }
            if title.chars().count() > 32 || message.chars().count() > 255 {
                return Err(
                    "Validation titles allow 32 characters and messages allow 255 characters.",
                );
            }
        }
        Ok(())
    }
}
