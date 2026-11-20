//! Bounded Programming-by-Example (PBE) string synthesizer for Flash Fill.
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};

const MAX_SYNTH_OUTPUT_CHARS: usize = 256;
const MAX_SEARCH_POPS: usize = 4_000;
const MAX_CANDIDATE_PROGRAMS: usize = 32;
const DELIMS: [char; 8] = ['@', '-', '_', '.', ',', '/', ':', ' '];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(super) enum CaseMode {
    AsIs,
    Lower,
    Upper,
    Title,
    Trim,
    TrimLower,
    TrimUpper,
    TrimTitle,
}

impl CaseMode {
    const ALL: [Self; 8] = [
        Self::AsIs,
        Self::Lower,
        Self::Upper,
        Self::Title,
        Self::Trim,
        Self::TrimLower,
        Self::TrimUpper,
        Self::TrimTitle,
    ];

    fn cost(self) -> u32 {
        match self {
            Self::AsIs => 0,
            Self::Lower | Self::Upper | Self::Title => 2,
            Self::Trim => 3,
            Self::TrimLower | Self::TrimUpper | Self::TrimTitle => 4,
        }
    }

    fn apply(self, raw: &str) -> String {
        let base;
        let text = match self {
            Self::Trim | Self::TrimLower | Self::TrimUpper | Self::TrimTitle => {
                base = collapse_spaces(raw);
                base.as_str()
            }
            _ => raw,
        };
        match self {
            Self::AsIs | Self::Trim => text.to_owned(),
            Self::Lower | Self::TrimLower => text.to_lowercase(),
            Self::Upper | Self::TrimUpper => text.to_uppercase(),
            Self::Title | Self::TrimTitle => to_title_case(text),
        }
    }
}

fn collapse_spaces(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for (idx, word) in s.split_whitespace().enumerate() {
        if idx > 0 {
            out.push(' ');
        }
        out.push_str(word);
    }
    out
}

fn to_title_case(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut word_start = true;
    for ch in s.chars() {
        if ch.is_alphanumeric() {
            if word_start {
                for up in ch.to_uppercase() {
                    out.push(up);
                }
                word_start = false;
            } else {
                for lo in ch.to_lowercase() {
                    out.push(lo);
                }
            }
        } else {
            out.push(ch);
            word_start = true;
        }
    }
    out
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(super) enum Extractor {
    Full,
    SpaceToken(i16),
    WordToken(i16),
    AlphaRun(i16),
    DigitRun(i16),
    BeforeDelim(char, u8),
    AfterDelim(char, u8),
    BetweenDelim(char, u8),
    SpaceInitial(i16),
    WordInitial(i16),
    PrefixChars(u8),
    SuffixChars(u8),
    CharSlice(u8, u8),
}

impl Extractor {
    fn cost(self) -> u32 {
        match self {
            Self::Full => 4,
            Self::SpaceToken(_) | Self::BeforeDelim(_, _) | Self::AfterDelim(_, _) => 6,
            Self::WordToken(_) | Self::BetweenDelim(_, _) => 7,
            Self::AlphaRun(_) | Self::DigitRun(_) => 8,
            Self::SpaceInitial(_) | Self::WordInitial(_) => 9,
            Self::PrefixChars(_) | Self::SuffixChars(_) => 15,
            Self::CharSlice(_, _) => 18,
        }
    }

    fn extract(self, input: &str) -> Option<String> {
        let trimmed = input.trim();
        match self {
            Self::Full => Some(input.to_owned()),
            Self::SpaceToken(idx) => {
                let items: Vec<&str> = trimmed.split_whitespace().collect();
                pick_index(&items, idx).map(str::to_owned)
            }
            Self::WordToken(idx) => {
                let items: Vec<&str> = split_words(trimmed);
                pick_index(&items, idx).map(str::to_owned)
            }
            Self::AlphaRun(idx) => {
                let items = collect_char_runs(trimmed, char::is_alphabetic);
                pick_index(&items, idx).map(str::to_owned)
            }
            Self::DigitRun(idx) => {
                let items = collect_char_runs(trimmed, |c| c.is_ascii_digit());
                pick_index(&items, idx).map(str::to_owned)
            }
            Self::BeforeDelim(delim, nth) => {
                let pos = nth_delim_byte(trimmed, delim, nth as usize)?;
                Some(trimmed[..pos].trim().to_owned())
            }
            Self::AfterDelim(delim, nth) => {
                let pos = nth_delim_byte(trimmed, delim, nth as usize)?;
                Some(trimmed[pos + delim.len_utf8()..].trim().to_owned())
            }
            Self::BetweenDelim(delim, nth) => {
                let start = nth_delim_byte(trimmed, delim, nth as usize)? + delim.len_utf8();
                let rest = &trimmed[start..];
                let end = rest.find(delim)?;
                Some(rest[..end].trim().to_owned())
            }
            Self::SpaceInitial(idx) => {
                let items: Vec<&str> = trimmed.split_whitespace().collect();
                let token = pick_index(&items, idx)?;
                token.chars().next().map(|c| c.to_string())
            }
            Self::WordInitial(idx) => {
                let items: Vec<&str> = split_words(trimmed);
                let token = pick_index(&items, idx)?;
                token.chars().next().map(|c| c.to_string())
            }
            Self::PrefixChars(n) => {
                let chars: Vec<char> = trimmed.chars().collect();
                let n = n as usize;
                (chars.len() >= n && n > 0).then(|| chars[..n].iter().collect())
            }
            Self::SuffixChars(n) => {
                let chars: Vec<char> = trimmed.chars().collect();
                let n = n as usize;
                (chars.len() >= n && n > 0).then(|| chars[chars.len() - n..].iter().collect())
            }
            Self::CharSlice(start, len) => {
                let chars: Vec<char> = trimmed.chars().collect();
                let s = start as usize;
                let e = s + len as usize;
                (len > 0 && e <= chars.len()).then(|| chars[s..e].iter().collect())
            }
        }
    }
}

fn is_word_sep(ch: char) -> bool {
    ch.is_whitespace()
        || matches!(
            ch,
            '-' | '_' | '.' | ',' | '/' | '\\' | '@' | ':' | ';' | '(' | ')' | '[' | ']' | '|'
        )
}

fn split_words(s: &str) -> Vec<&str> {
    s.split(is_word_sep).filter(|part| !part.is_empty()).collect()
}

fn collect_char_runs<F: Fn(char) -> bool>(s: &str, pred: F) -> Vec<&str> {
    let mut runs = Vec::new();
    let mut start: Option<usize> = None;
    for (idx, ch) in s.char_indices() {
        if pred(ch) {
            if start.is_none() {
                start = Some(idx);
            }
        } else if let Some(begin) = start.take() {
            runs.push(&s[begin..idx]);
        }
    }
    if let Some(begin) = start {
        runs.push(&s[begin..]);
    }
    runs
}

fn pick_index<'a>(items: &[&'a str], idx: i16) -> Option<&'a str> {
    if items.is_empty() {
        return None;
    }
    let resolved = if idx >= 0 {
        idx as usize
    } else {
        let back = (-idx) as usize;
        items.len().checked_sub(back)?
    };
    items.get(resolved).copied()
}

fn nth_delim_byte(s: &str, delim: char, nth: usize) -> Option<usize> {
    s.match_indices(delim).nth(nth).map(|(pos, _)| pos)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(super) struct SourceExpr {
    pub(super) col: usize,
    pub(super) extractor: Extractor,
    pub(super) case: CaseMode,
}

impl SourceExpr {
    fn cost(self) -> u32 {
        self.extractor.cost() + self.case.cost()
    }

    fn eval(self, inputs: &[String]) -> Option<String> {
        let raw = inputs.get(self.col)?;
        let extracted = self.extractor.extract(raw)?;
        Some(self.case.apply(&extracted))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum Part {
    Literal(String),
    Expr(SourceExpr),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct FlashProgram {
    parts: Vec<Part>,
}

impl FlashProgram {
    pub(super) fn eval(&self, inputs: &[String]) -> Option<String> {
        let mut out = String::new();
        for part in &self.parts {
            match part {
                Part::Literal(lit) => out.push_str(lit),
                Part::Expr(expr) => out.push_str(&expr.eval(inputs)?),
            }
        }
        Some(out)
    }

    fn from_edges(edges: Vec<EdgeKind>) -> Self {
        let mut parts: Vec<Part> = Vec::new();
        for edge in edges {
            match edge {
                EdgeKind::Literal(ch) => {
                    if let Some(Part::Literal(last)) = parts.last_mut() {
                        last.push(ch);
                    } else {
                        parts.push(Part::Literal(ch.to_string()));
                    }
                }
                EdgeKind::Expr(expr) => parts.push(Part::Expr(expr)),
            }
        }
        Self { parts }
    }

    fn has_expr(&self) -> bool {
        self.parts.iter().any(|part| matches!(part, Part::Expr(_)))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum EdgeKind {
    Expr(SourceExpr),
    Literal(char),
}

fn generate_extractors(input: &str) -> Vec<Extractor> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let mut out = vec![Extractor::Full];
    let spaces = trimmed.split_whitespace().count();
    for i in 0..spaces.min(5) {
        out.push(Extractor::SpaceToken(i as i16));
        out.push(Extractor::SpaceInitial(i as i16));
    }
    for i in 1..=spaces.min(3) {
        out.push(Extractor::SpaceToken(-(i as i16)));
        out.push(Extractor::SpaceInitial(-(i as i16)));
    }
    let words = split_words(trimmed).len();
    for i in 0..words.min(6) {
        out.push(Extractor::WordToken(i as i16));
        out.push(Extractor::WordInitial(i as i16));
    }
    for i in 1..=words.min(4) {
        out.push(Extractor::WordToken(-(i as i16)));
        out.push(Extractor::WordInitial(-(i as i16)));
    }
    let alphas = collect_char_runs(trimmed, char::is_alphabetic).len();
    for i in 0..alphas.min(4) {
        out.push(Extractor::AlphaRun(i as i16));
    }
    for i in 1..=alphas.min(2) {
        out.push(Extractor::AlphaRun(-(i as i16)));
    }
    let digits = collect_char_runs(trimmed, |c| c.is_ascii_digit()).len();
    for i in 0..digits.min(4) {
        out.push(Extractor::DigitRun(i as i16));
    }
    for i in 1..=digits.min(2) {
        out.push(Extractor::DigitRun(-(i as i16)));
    }
    for delim in DELIMS {
        let count = trimmed.matches(delim).count().min(3);
        for nth in 0..count {
            out.push(Extractor::BeforeDelim(delim, nth as u8));
            out.push(Extractor::AfterDelim(delim, nth as u8));
            if nth + 1 < count {
                out.push(Extractor::BetweenDelim(delim, nth as u8));
            }
        }
    }
    let char_len = trimmed.chars().count();
    let compact = !trimmed.chars().any(char::is_whitespace);
    if compact {
        for n in 2..=char_len.min(8) {
            out.push(Extractor::PrefixChars(n as u8));
            out.push(Extractor::SuffixChars(n as u8));
        }
        // Fixed slices only for compact structured codes (phone numbers, dates, IDs).
        if char_len <= 24 {
            for start in 1..char_len {
                for len in 2..=(char_len - start).min(6) {
                    out.push(Extractor::CharSlice(start as u8, len as u8));
                }
            }
        }
    }
    out
}

/// Synthesizes the simplest string transformation matching all `(inputs, output)` examples.
pub(super) fn synthesize(examples: &[(Vec<String>, String)]) -> Option<FlashProgram> {
    let (first_inputs, first_output) = examples.first()?;
    if first_output.is_empty() || first_output.chars().count() > MAX_SYNTH_OUTPUT_CHARS {
        return None;
    }
    let out_chars: Vec<char> = first_output.chars().collect();
    let n = out_chars.len();
    let byte_offsets: Vec<usize> = first_output
        .char_indices()
        .map(|(b, _)| b)
        .chain(std::iter::once(first_output.len()))
        .collect();

    // Map (start_char, end_char) -> cheapest SourceExprs producing first_output[start..end].
    let mut expr_edges: Vec<Vec<(usize, u32, SourceExpr)>> = vec![Vec::new(); n];
    let mut best_for_span: HashMap<(usize, usize), Vec<(u32, SourceExpr)>> = HashMap::new();

    for (col, raw_input) in first_inputs.iter().enumerate() {
        for extractor in generate_extractors(raw_input) {
            let Some(extracted) = extractor.extract(raw_input) else {
                continue;
            };
            if extracted.is_empty() {
                continue;
            }
            for case in CaseMode::ALL {
                let candidate = case.apply(&extracted);
                if candidate.is_empty() || !first_output.contains(&candidate) {
                    continue;
                }
                let expr = SourceExpr {
                    col,
                    extractor,
                    case,
                };
                // Multi-example pruning: every other example must at least evaluate this expr.
                if examples
                    .iter()
                    .skip(1)
                    .any(|(ins, out)| match expr.eval(ins) {
                        Some(val) if !val.is_empty() => !out.contains(&val),
                        _ => true,
                    })
                {
                    continue;
                }
                let cand_chars = candidate.chars().count();
                let cost = expr.cost();
                for start in 0..=(n.saturating_sub(cand_chars)) {
                    let end = start + cand_chars;
                    if &first_output[byte_offsets[start]..byte_offsets[end]] == candidate {
                        let slot = best_for_span.entry((start, end)).or_default();
                        if !slot.iter().any(|(_, existing)| *existing == expr) {
                            slot.push((cost, expr));
                        }
                    }
                }
            }
        }
    }

    for ((start, end), mut list) in best_for_span {
        list.sort_by_key(|(cost, expr)| (*cost, *expr));
        list.truncate(4);
        for (cost, expr) in list {
            expr_edges[start].push((end, cost, expr));
        }
    }

    let mut heap: BinaryHeap<Reverse<(u32, usize, Vec<EdgeKind>)>> = BinaryHeap::new();
    let mut visits = vec![0usize; n + 1];
    heap.push(Reverse((0, 0, Vec::new())));

    let mut pops = 0usize;
    let mut tested = 0usize;
    while let Some(Reverse((cost, pos, path))) = heap.pop() {
        pops += 1;
        if pops > MAX_SEARCH_POPS || tested >= MAX_CANDIDATE_PROGRAMS {
            break;
        }
        if visits[pos] >= MAX_CANDIDATE_PROGRAMS {
            continue;
        }
        visits[pos] += 1;

        if pos == n {
            let program = FlashProgram::from_edges(path);
            if program.has_expr() {
                tested += 1;
                if examples
                    .iter()
                    .all(|(ins, out)| program.eval(ins).as_deref() == Some(out.as_str()))
                {
                    return Some(program);
                }
            }
            continue;
        }

        for &(end, edge_cost, expr) in &expr_edges[pos] {
            let mut next = path.clone();
            next.push(EdgeKind::Expr(expr));
            heap.push(Reverse((cost + edge_cost, end, next)));
        }

        // Literal edge: punctuation/spaces are cheap; alnum chars cost more than semantic tokens.
        // Penalize splitting a literal word after a 1-char initial (e.g. "a"+"cme" in "@acme.com").
        let ch = out_chars[pos];
        let split_initial_word = ch.is_lowercase()
            && matches!(
                path.last(),
                Some(EdgeKind::Expr(e))
                    if matches!(e.extractor, Extractor::SpaceInitial(_) | Extractor::WordInitial(_))
            );
        let lit_cost = if !ch.is_alphanumeric() {
            4
        } else if split_initial_word {
            22
        } else {
            12
        };
        let mut next = path;
        next.push(EdgeKind::Literal(ch));
        heap.push(Reverse((cost + lit_cost, pos + 1, next)));
    }
    None
}
