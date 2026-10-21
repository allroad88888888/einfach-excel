use super::FormulaLimitation;

pub(super) fn for_function(name: &str) -> Vec<FormulaLimitation> {
    let pairs: &[(&str, &str)] = match name {
        "IMAGE" => &[("Returns image metadata as text; does not display an image.", "返回图片元数据文本，不显示图片。"),
            ("Sizing: 0 original, 1 stretch, 2 preserve aspect ratio, 3 custom size. Height and width are accepted only with sizing 3 (or as empty omissions).", "尺寸模式：0 原尺寸、1 拉伸、2 保持比例、3 自定义；高度与宽度仅在模式 3 可提供，其他模式只能省略。")],
        "HYPERLINK" => &[("Returns display text; does not create a clickable link.", "只返回显示文本，不创建可点击链接。")],
        "TRANSLATE" => &[("Replaces characters; does not translate between languages.", "仅替换字符，不提供语言翻译。")],
        "SEARCH" | "SEARCHB" => &[("Search is literal; wildcard patterns are not supported.", "仅查找字面文本，不支持通配符模式。")],
        "DATEVALUE" => &[("Only YYYY-MM-DD and YYYY/MM/DD dates are accepted; localized date text is not parsed.", "仅接受 YYYY-MM-DD 与 YYYY/MM/DD，不解析本地化日期文本。")],
        "TIMEVALUE" => &[("Accepts HH:MM or HH:MM:SS; localized AM/PM text is not parsed.", "接受 HH:MM 或 HH:MM:SS，不解析本地化上午/下午文本。")],
        "ACCRINT" => &[("Simplified issue-to-settlement accrual: first_interest and calc_method are read and validated but do not change the result. par is required.", "使用发行至结算的简化应计计算：读取并校验 first_interest 与 calc_method，但它们不改变结果；par 必填。")],
        "ISREF" => &[("Checks the argument syntax; named values and reference-returning formulas are not followed.", "检测参数语法，不追溯名称值或返回引用的公式。")],
        "CHAR" | "CODE" => &[("Uses Unicode scalar values, rather than a platform-specific 8-bit code page.", "使用 Unicode 码点，不使用平台相关的 8 位字符集。")],
        "REGEXTEST" | "REGEXEXTRACT" | "REGEXREPLACE" => &[("Available only in the full build. Uses Rust regex syntax: look-around and backreferences in patterns are unsupported; \\d, \\w and \\s use the engine ASCII rules.", "仅 full 构建提供；使用 Rust 正则语法，不支持环视及模式内反向引用；\\d、\\w、\\s 按引擎 ASCII 规则处理。")],
        "LET" => &[("Binding names must be identifiers; this engine permits names that shadow built-in function names.", "绑定名称必须为标识符；引擎允许绑定名称遮蔽内置函数名称。")],
        "INFO" => &[("Supported keys: directory (empty), numfile (1), osversion (empty), recalc (Automatic), release and system.", "支持键：directory（空）、numfile（1）、osversion（空）、recalc（Automatic）、release、system。")],
        "INDEX" => &[("Uses a two-dimensional cell reference. Literal array constants and the reference-form area_num argument are not supported.", "使用二维单元格引用，不支持字面数组常量或引用形式的 area_num 参数。")],
        "CEILING" | "FLOOR" => &[("This implementation is unary integer rounding, not Office's two-argument significance form. Use CEILING.MATH/FLOOR.MATH for multiples.", "本实现为单参数整数舍入，不是 Office 的双参数基数形式；倍数舍入请使用 CEILING.MATH/FLOOR.MATH。")],
        "MOD" => &[("Uses Euclidean remainder: a negative divisor does not make the result negative as it would in Office.", "使用欧几里得余数，除数为负时结果也不会像 Office 一样变为负数。")],
        "PHONETIC" => &[("Phonetic/ruby metadata is not stored; this function returns its text input unchanged.", "不存储拼音或注音元数据，本函数原样返回输入文本。")],
        "TODAY" | "NOW" | "PI" => &[("Use the zero-argument call shown here. The current evaluator ignores extra arguments.", "请使用此处的无参数调用；当前求值器会忽略额外参数。")],
        "ERF.PRECISE" => &[("An alias of ERF in this engine; unlike Office, a second upper-limit argument is also accepted.", "本引擎中是 ERF 的别名；与 Office 不同，也接受第二个上限参数。")],
        "ISOMITTED" => &[("Outside an active LAMBDA call the result is #NAME?. A supplied empty argument is not the same as a missing argument.", "在运行中的 LAMBDA 调用之外返回 #NAME?；传入空参数与缺少参数不同。")],
        "AVERAGEIF" | "AVERAGEIFS" | "COUNTIFS" | "SUMIFS" | "MAXIFS" | "MINIFS" |
        "VLOOKUP" | "HLOOKUP" | "ROWS" | "COLUMNS" | "MDETERM" |
        "CORREL" | "PEARSON" | "COVAR" | "COVAR.P" | "COVAR.S" | "COVARIANCE.P" | "COVARIANCE.S" |
        "SLOPE" | "INTERCEPT" | "STEYX" | "RSQ" | "PROB" | "CHISQ.TEST" | "CHITEST" |
        "SUMX2MY2" | "SUMX2PY2" | "SUMXMY2" | "IRR" | "MIRR" |
        "DSUM" | "DAVERAGE" | "DCOUNT" | "DCOUNTA" | "DMAX" | "DMIN" | "DPRODUCT" |
        "DGET" | "DSTDEV" | "DSTDEVP" | "DVAR" | "DVARP" => &[(
            "The current evaluator requires reference-backed data for the range arguments here; literal array constants are not accepted. Use cell ranges. Paired statistical ranges must have identical row and column counts.",
            "当前求值器要求此处的区域参数来自引用，不接受字面数组常量，请使用单元格区域。成对统计区域必须具有相同的行列数。")],
        "XLOOKUP" => &[("lookup_array and return_array must be reference-backed; literal array constants are not accepted by this implementation.", "lookup_array 与 return_array 必须来自引用，此实现不接受字面数组常量。")],
        _ => &[],
    };
    pairs.iter().map(|&(en, zh)| FormulaLimitation { en, zh }).collect()
}
