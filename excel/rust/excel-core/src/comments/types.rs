//! 工作簿内显示名只是用户文本；线程不声明已认证身份或网络协作。
use serde::{Deserialize, Serialize};

pub const MAX_COMMENT_CHARACTERS: usize = 32767;
pub const MAX_COMMENT_AUTHOR_CHARACTERS: usize = 100;
pub const MAX_COMMENT_ENTRIES: usize = 1000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommentEntryKind { Message, Resolve, Reopen }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeCommentEntry {
    pub kind: CommentEntryKind,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub created_at: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeCommentThread {
    pub entries: Vec<NativeCommentEntry>,
    pub resolved: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
pub enum NativeCommentChange {
    Create { author: String, body: String },
    Reply { author: String, body: String },
    Resolve { author: String },
    Reopen { author: String },
}

pub fn normalize_author(value: &str) -> Result<String, &'static str> {
    let author = value.trim();
    if author.is_empty() { return Err("Enter a workbook display name."); }
    if author.chars().count() > MAX_COMMENT_AUTHOR_CHARACTERS {
        return Err("Display name cannot exceed 100 characters.");
    }
    if author.chars().any(char::is_control) {
        return Err("Display name cannot contain control characters.");
    }
    Ok(author.to_owned())
}

pub fn normalize_body(value: &str) -> Result<String, &'static str> {
    let body = value.replace("\r\n", "\n").replace('\r', "\n");
    if body.trim().is_empty() { return Err("Enter comment text."); }
    if body.contains('\0') { return Err("Comment text cannot contain a null character."); }
    if body.chars().count() > MAX_COMMENT_CHARACTERS {
        return Err("Comment text cannot exceed 32767 characters.");
    }
    Ok(body)
}

impl NativeCommentThread {
    /// 文件也必须描述可达的线程状态，不能伪造空线程或无对应事件的解决态。
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.entries.is_empty() || self.entries.len() > MAX_COMMENT_ENTRIES {
            return Err("A comment thread must contain 1 to 1000 entries.");
        }
        let mut resolved = false;
        let mut previous = 0;
        for (index, entry) in self.entries.iter().enumerate() {
            if normalize_author(&entry.author)? != entry.author {
                return Err("Invalid comment display name.");
            }
            if entry.created_at < previous || entry.created_at > 8_640_000_000_000_000 {
                return Err("Invalid comment timestamp.");
            }
            previous = entry.created_at;
            match entry.kind {
                CommentEntryKind::Message if !resolved => {
                    let body = entry.body.as_deref().ok_or("Comment text is missing.")?;
                    if normalize_body(body)? != body { return Err("Invalid comment line endings."); }
                }
                CommentEntryKind::Resolve if index > 0 && !resolved && entry.body.is_none() => resolved = true,
                CommentEntryKind::Reopen if index > 0 && resolved && entry.body.is_none() => resolved = false,
                _ => return Err("Invalid comment thread history."),
            }
        }
        if resolved != self.resolved { return Err("Invalid comment thread status."); }
        Ok(())
    }

    pub fn retained_bytes(&self) -> usize {
        64 + self.entries.iter().map(|entry|
            64 + entry.author.len() + entry.body.as_ref().map_or(0, String::len)).sum::<usize>()
    }
}
