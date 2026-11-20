//! 渲染输出缓冲：按字符计数，记录第一个 `*x` 填充与每个 `_x` 留白的位置。
use super::lexer::Token;
use super::CharMark;

#[derive(Default)]
pub(super) struct Out {
    text: String,
    chars: usize,
    fill: Option<CharMark>,
    pads: Vec<CharMark>,
}

impl Out {
    pub(super) fn push(&mut self, ch: char) {
        self.text.push(ch);
        self.chars += 1;
    }

    pub(super) fn push_str(&mut self, text: &str) {
        self.text.push_str(text);
        self.chars += text.chars().count();
    }

    /// Excel 每段只展开一个填充；之后的 `*x` 不再占位。
    pub(super) fn fill(&mut self, ch: char) {
        if self.fill.is_none() {
            self.fill = Some(CharMark { ch, at: self.chars });
        }
    }

    /// `_x`：纯文本里是一个空格，渲染器在该位置留出字符 `x` 的宽度。
    pub(super) fn pad(&mut self, ch: char) {
        self.pads.push(CharMark { ch, at: self.chars });
        self.push(' ');
    }

    /// 不参与数值计算的记号：填充、留白或原样字符。
    pub(super) fn literal(&mut self, token: &Token) {
        match token {
            Token::Fill(ch) => self.fill(*ch),
            Token::Pad(ch) => self.pad(*ch),
            other => self.push_str(&other.literal_text()),
        }
    }

    pub(super) fn into_parts(self) -> (String, Option<CharMark>, Vec<CharMark>) {
        (self.text, self.fill, self.pads)
    }
}
