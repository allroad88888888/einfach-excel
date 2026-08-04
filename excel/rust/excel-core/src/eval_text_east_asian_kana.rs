pub(super) fn fullwidth_kana_to_halfwidth(c: char) -> Option<(char, Option<char>)> {
    // Voiced full-width → half-width base + ﾞ.
    let voiced = match c {
        'ガ' => Some('\u{FF76}'), // カ→ｶ
        'ギ' => Some('\u{FF77}'),
        'グ' => Some('\u{FF78}'),
        'ゲ' => Some('\u{FF79}'),
        'ゴ' => Some('\u{FF7A}'),
        'ザ' => Some('\u{FF7B}'),
        'ジ' => Some('\u{FF7C}'),
        'ズ' => Some('\u{FF7D}'),
        'ゼ' => Some('\u{FF7E}'),
        'ゾ' => Some('\u{FF7F}'),
        'ダ' => Some('\u{FF80}'),
        'ヂ' => Some('\u{FF81}'),
        'ヅ' => Some('\u{FF82}'),
        'デ' => Some('\u{FF83}'),
        'ド' => Some('\u{FF84}'),
        'バ' => Some('\u{FF8A}'),
        'ビ' => Some('\u{FF8B}'),
        'ブ' => Some('\u{FF8C}'),
        'ベ' => Some('\u{FF8D}'),
        'ボ' => Some('\u{FF8E}'),
        'ヴ' => Some('\u{FF73}'), // ウ→ｳ + ﾞ
        _ => None,
    };
    if let Some(base) = voiced {
        return Some((base, Some('\u{FF9E}')));
    }
    // Semi-voiced full-width → half-width base + ﾟ.
    let semi_voiced = match c {
        'パ' => Some('\u{FF8A}'),
        'ピ' => Some('\u{FF8B}'),
        'プ' => Some('\u{FF8C}'),
        'ペ' => Some('\u{FF8D}'),
        'ポ' => Some('\u{FF8E}'),
        _ => None,
    };
    if let Some(base) = semi_voiced {
        return Some((base, Some('\u{FF9F}')));
    }
    // Plain full-width kana / punctuation → half-width.
    let base = match c {
        '。' => '\u{FF61}',
        '「' => '\u{FF62}',
        '」' => '\u{FF63}',
        '、' => '\u{FF64}',
        '・' => '\u{FF65}',
        'ヲ' => '\u{FF66}',
        'ァ' => '\u{FF67}',
        'ィ' => '\u{FF68}',
        'ゥ' => '\u{FF69}',
        'ェ' => '\u{FF6A}',
        'ォ' => '\u{FF6B}',
        'ャ' => '\u{FF6C}',
        'ュ' => '\u{FF6D}',
        'ョ' => '\u{FF6E}',
        'ッ' => '\u{FF6F}',
        'ー' => '\u{FF70}',
        'ア' => '\u{FF71}',
        'イ' => '\u{FF72}',
        'ウ' => '\u{FF73}',
        'エ' => '\u{FF74}',
        'オ' => '\u{FF75}',
        'カ' => '\u{FF76}',
        'キ' => '\u{FF77}',
        'ク' => '\u{FF78}',
        'ケ' => '\u{FF79}',
        'コ' => '\u{FF7A}',
        'サ' => '\u{FF7B}',
        'シ' => '\u{FF7C}',
        'ス' => '\u{FF7D}',
        'セ' => '\u{FF7E}',
        'ソ' => '\u{FF7F}',
        'タ' => '\u{FF80}',
        'チ' => '\u{FF81}',
        'ツ' => '\u{FF82}',
        'テ' => '\u{FF83}',
        'ト' => '\u{FF84}',
        'ナ' => '\u{FF85}',
        'ニ' => '\u{FF86}',
        'ヌ' => '\u{FF87}',
        'ネ' => '\u{FF88}',
        'ノ' => '\u{FF89}',
        'ハ' => '\u{FF8A}',
        'ヒ' => '\u{FF8B}',
        'フ' => '\u{FF8C}',
        'ヘ' => '\u{FF8D}',
        'ホ' => '\u{FF8E}',
        'マ' => '\u{FF8F}',
        'ミ' => '\u{FF90}',
        'ム' => '\u{FF91}',
        'メ' => '\u{FF92}',
        'モ' => '\u{FF93}',
        'ヤ' => '\u{FF94}',
        'ユ' => '\u{FF95}',
        'ヨ' => '\u{FF96}',
        'ラ' => '\u{FF97}',
        'リ' => '\u{FF98}',
        'ル' => '\u{FF99}',
        'レ' => '\u{FF9A}',
        'ロ' => '\u{FF9B}',
        'ワ' => '\u{FF9C}',
        'ン' => '\u{FF9D}',
        '゛' => '\u{FF9E}',
        '゜' => '\u{FF9F}',
        _ => return None,
    };
    Some((base, None))
}

/// Widen a single half-width katakana / punctuation char to full-width,
/// optionally composing with the following ﾞ (U+FF9E) or ﾟ (U+FF9F)
/// into a voiced / semi-voiced kana. Returns `(full_width, consumed)`
/// where `consumed` is 2 when the mark was absorbed, else 1.
///
/// Pre-condition: caller has verified `c` is in U+FF61..U+FF9F.
pub(super) fn halfwidth_kana_to_fullwidth(c: char, next: Option<char>) -> (char, usize) {
    // Voicing composition: base + ﾞ → voiced kana.
    if next == Some('\u{FF9E}') {
        let voiced = match c {
            '\u{FF73}' => Some('ヴ'), // ウ + ﾞ → ヴ
            '\u{FF76}' => Some('ガ'),
            '\u{FF77}' => Some('ギ'),
            '\u{FF78}' => Some('グ'),
            '\u{FF79}' => Some('ゲ'),
            '\u{FF7A}' => Some('ゴ'),
            '\u{FF7B}' => Some('ザ'),
            '\u{FF7C}' => Some('ジ'),
            '\u{FF7D}' => Some('ズ'),
            '\u{FF7E}' => Some('ゼ'),
            '\u{FF7F}' => Some('ゾ'),
            '\u{FF80}' => Some('ダ'),
            '\u{FF81}' => Some('ヂ'),
            '\u{FF82}' => Some('ヅ'),
            '\u{FF83}' => Some('デ'),
            '\u{FF84}' => Some('ド'),
            '\u{FF8A}' => Some('バ'),
            '\u{FF8B}' => Some('ビ'),
            '\u{FF8C}' => Some('ブ'),
            '\u{FF8D}' => Some('ベ'),
            '\u{FF8E}' => Some('ボ'),
            _ => None,
        };
        if let Some(v) = voiced {
            return (v, 2);
        }
    }
    // Semi-voicing composition: base + ﾟ → semi-voiced kana.
    if next == Some('\u{FF9F}') {
        let semi = match c {
            '\u{FF8A}' => Some('パ'),
            '\u{FF8B}' => Some('ピ'),
            '\u{FF8C}' => Some('プ'),
            '\u{FF8D}' => Some('ペ'),
            '\u{FF8E}' => Some('ポ'),
            _ => None,
        };
        if let Some(v) = semi {
            return (v, 2);
        }
    }
    // Plain widening (no composition).
    let full = match c {
        '\u{FF61}' => '。',
        '\u{FF62}' => '「',
        '\u{FF63}' => '」',
        '\u{FF64}' => '、',
        '\u{FF65}' => '・',
        '\u{FF66}' => 'ヲ',
        '\u{FF67}' => 'ァ',
        '\u{FF68}' => 'ィ',
        '\u{FF69}' => 'ゥ',
        '\u{FF6A}' => 'ェ',
        '\u{FF6B}' => 'ォ',
        '\u{FF6C}' => 'ャ',
        '\u{FF6D}' => 'ュ',
        '\u{FF6E}' => 'ョ',
        '\u{FF6F}' => 'ッ',
        '\u{FF70}' => 'ー',
        '\u{FF71}' => 'ア',
        '\u{FF72}' => 'イ',
        '\u{FF73}' => 'ウ',
        '\u{FF74}' => 'エ',
        '\u{FF75}' => 'オ',
        '\u{FF76}' => 'カ',
        '\u{FF77}' => 'キ',
        '\u{FF78}' => 'ク',
        '\u{FF79}' => 'ケ',
        '\u{FF7A}' => 'コ',
        '\u{FF7B}' => 'サ',
        '\u{FF7C}' => 'シ',
        '\u{FF7D}' => 'ス',
        '\u{FF7E}' => 'セ',
        '\u{FF7F}' => 'ソ',
        '\u{FF80}' => 'タ',
        '\u{FF81}' => 'チ',
        '\u{FF82}' => 'ツ',
        '\u{FF83}' => 'テ',
        '\u{FF84}' => 'ト',
        '\u{FF85}' => 'ナ',
        '\u{FF86}' => 'ニ',
        '\u{FF87}' => 'ヌ',
        '\u{FF88}' => 'ネ',
        '\u{FF89}' => 'ノ',
        '\u{FF8A}' => 'ハ',
        '\u{FF8B}' => 'ヒ',
        '\u{FF8C}' => 'フ',
        '\u{FF8D}' => 'ヘ',
        '\u{FF8E}' => 'ホ',
        '\u{FF8F}' => 'マ',
        '\u{FF90}' => 'ミ',
        '\u{FF91}' => 'ム',
        '\u{FF92}' => 'メ',
        '\u{FF93}' => 'モ',
        '\u{FF94}' => 'ヤ',
        '\u{FF95}' => 'ユ',
        '\u{FF96}' => 'ヨ',
        '\u{FF97}' => 'ラ',
        '\u{FF98}' => 'リ',
        '\u{FF99}' => 'ル',
        '\u{FF9A}' => 'レ',
        '\u{FF9B}' => 'ロ',
        '\u{FF9C}' => 'ワ',
        '\u{FF9D}' => 'ン',
        '\u{FF9E}' => '゛',
        '\u{FF9F}' => '゜',
        // Caller guarantees U+FF61..U+FF9F; anything else falls through
        // unchanged (defence in depth — shouldn't happen).
        _ => c,
    };
    (full, 1)
}
