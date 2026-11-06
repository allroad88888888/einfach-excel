use crate::{CellRange, CellStyle, Sheet};

impl Sheet {
    /// A whole-cell font command supersedes only the run attributes it explicitly changes.
    pub(crate) fn clear_inline_font_overrides(&mut self, range: CellRange, patch: &CellStyle) {
        if patch.bold.is_none() && patch.italic.is_none() && patch.underline.is_none()
            && patch.strikethrough.is_none() && patch.color.is_none()
            && patch.font_size.is_none() && patch.font_family.is_none() { return; }
        for (addr, runs) in &mut self.rich_text {
            if !range.contains(*addr) { continue; }
            for run in runs {
                let format = &mut run.format;
                if patch.bold.is_some() { format.bold = None; }
                if patch.italic.is_some() { format.italic = None; }
                if patch.underline.is_some() { format.underline = None; }
                if patch.strikethrough.is_some() { format.strikethrough = None; }
                if patch.color.is_some() { format.color = None; }
                if patch.font_size.is_some() { format.font_size = None; }
                if patch.font_family.is_some() { format.font_family = None; }
            }
        }
    }
}
