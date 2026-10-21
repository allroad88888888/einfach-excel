//! Parameter vocabulary shared by genuinely identical parameter roles.
pub(super) fn describe(function: &str, name: &str) -> (&'static str, &'static str) {
    match (function, name) {
        ("PERCENTILE" | "PERCENTILE.INC" | "PERCENTILE.EXC", "k") =>
            return ("Percentile fraction; inclusive functions allow 0–1, exclusive functions require an interior sample position.", "百分位比例；包含端点函数允许 0–1，不含端点函数要求落在样本内部位置。"),
        ("PERCENTRANK" | "PERCENTRANK.INC" | "PERCENTRANK.EXC", "significance") =>
            return ("Positive number of decimal digits used to truncate the relative rank; omitted means three.", "截断相对排名所用的正数小数位数；省略时为三。"),
        ("T.TEST" | "TTEST", "type") => return ("Test type: 1 paired, 2 equal variances, 3 unequal variances.", "检验类型：1 配对、2 等方差、3 异方差。"),
        ("EXPON.DIST" | "EXPONDIST", "lambda") => return ("Positive exponential rate parameter.", "正数指数分布速率参数。"),
        ("GESTEP", "step") => return ("Comparison threshold; omitted means zero.", "比较阈值；省略时为零。"),
        ("DB", "month") => return ("Number of months in the first depreciation year (1–12); omitted means twelve.", "第一折旧年的月数（1–12），省略时为十二。"),
        ("OFFSET", "rows") => return ("Signed row offset from the starting reference.", "相对于起始引用的有符号行偏移。"),
        ("OFFSET", "cols") => return ("Signed column offset from the starting reference.", "相对于起始引用的有符号列偏移。"),
        ("BESSELJ" | "BESSELY" | "BESSELI" | "BESSELK", "n") => return ("Nonnegative Bessel order; fractional input is truncated toward zero.", "非负贝塞尔阶数，小数向零截断。"),
        _ => {}
    }
    include_str!("parameters.tsv").lines().filter(|line| !line.starts_with('#'))
        .find_map(|line| {
            let fields: Vec<_> = line.split('\t').collect();
            (fields.len() == 3 && fields[0].split('|').any(|alias| alias == name))
                .then(|| (fields[1], fields[2]))
        }).unwrap_or_else(|| panic!("Missing parameter semantics for {name}"))
}
