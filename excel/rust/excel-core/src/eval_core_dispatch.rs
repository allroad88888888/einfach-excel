use super::*;

#[path = "formula_help/mod.rs"]
mod formula_help;
pub use formula_help::{BuiltinFunctionHelp, FormulaLimitation, FormulaParameter, FormulaRepeatGroup};

/// Metadata for functions actually compiled into this engine, not the reserved-name policy.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct BuiltinFunction {
    pub name: &'static str,
    pub category: &'static str,
    pub note: Option<&'static str>,
    pub help: BuiltinFunctionHelp,
}

/// One definition drives evaluation and discovery; cfg gates apply to both.
macro_rules! define_builtin_dispatch {
    ($( $(#[$attr:meta])* $($name:literal)|+ => ($category:literal, $handler:path), )*) => {
        pub(super) fn eval_func(name: &str, args: &[Expr], provider: &dyn EvalProvider) -> Value {
            match name {
                $( $(#[$attr])* $($name)|+ => $handler(name, args, provider), )*
                _ => eval_named_call(name, args, provider),
            }
        }

        pub fn builtin_function_catalog() -> Vec<BuiltinFunction> {
            let mut functions = Vec::new();
            $( $(#[$attr])* {
                $( functions.push(BuiltinFunction {
                    name: $name,
                    category: $category,
                    help: formula_help::function_help($name),
                    note: match $name {
                        "IMAGE" => Some("Returns image metadata as text; does not display an image."),
                        "HYPERLINK" => Some("Returns display text; does not create a clickable link."),
                        "TRANSLATE" => Some("Replaces characters; does not translate between languages."),
                        _ => None,
                    },
                }); )+
            } )*
            functions.sort_by_key(|function| function.name);
            functions
        }
    };
}

define_builtin_dispatch! {
    "LET" | "LAMBDA" | "ISOMITTED" => ("Lambda", eval_fn_lambda::eval_fn_lambda),
    "SUM" | "AVERAGE" | "COUNT" | "MIN" | "MAX" | "COUNTA" | "COUNTBLANK" | "SUBTOTAL" | "AGGREGATE" => ("Math & statistics", eval_fn_aggregate_core::eval_fn_aggregate_core),
    "IF" | "AND" | "OR" | "NOT" | "IFERROR" | "IFNA" | "IFS" | "SWITCH" | "XOR" | "TRUE" | "FALSE" | "NA" => ("Logical", eval_fn_logical::eval_fn_logical),
    "ABS" | "SQRT" | "ROUND" | "CEILING" | "FLOOR" | "POWER" | "MOD" => ("Math & statistics", eval_fn_math_basic::eval_fn_math_basic),
    "CONCATENATE" | "LEN" | "LEFT" | "RIGHT" | "MID" | "UPPER" | "LOWER" | "TRIM" | "TEXT" => ("Text", eval_fn_text_basic::eval_fn_text_basic),
    "COUNTIF" | "SUMIF" | "AVERAGEIF" | "COUNTIFS" | "SUMIFS" | "AVERAGEIFS" | "MAXIFS" | "MINIFS" => ("Math & statistics", eval_fn_criteria::eval_fn_criteria),
    "VLOOKUP" | "HLOOKUP" | "INDEX" | "MATCH" => ("Lookup & reference", eval_fn_lookup_classic::eval_fn_lookup_classic),
    "MEDIAN" | "MODE" | "STDEV" | "VAR" | "LARGE" | "SMALL" => ("Math & statistics", eval_fn_statistics_core::eval_fn_statistics_core),
    "TODAY" | "NOW" | "DATE" | "YEAR" | "MONTH" | "DAY" => ("Date & time", eval_fn_date_basic::eval_fn_date_basic),
    "OFFSET" | "ROW" | "COLUMN" | "ROWS" | "COLUMNS" | "AREAS" => ("Lookup & reference", eval_fn_reference_position::eval_fn_reference_position),
    "INT" | "TRUNC" | "SIGN" | "EXP" | "LN" | "LOG" | "LOG10" | "PI" | "ROUNDUP" | "ROUNDDOWN" | "MROUND" => ("Math & statistics", eval_fn_math_rounding::eval_fn_math_rounding),
    "PRODUCT" | "QUOTIENT" | "FACT" | "COMBIN" | "GCD" | "LCM" => ("Math & statistics", eval_fn_math_combinatorics::eval_fn_math_combinatorics),
    "SIN" | "COS" | "TAN" | "ASIN" | "ACOS" | "ATAN" | "ATAN2" | "RADIANS" | "DEGREES" => ("Math & statistics", eval_fn_math_trigonometry::eval_fn_math_trigonometry),
    "ISNUMBER" | "ISTEXT" | "ISBLANK" | "ISERROR" | "ISERR" | "ISNA" | "ISLOGICAL" | "ISNONTEXT" | "ISEVEN" | "ISODD" | "N" | "TYPE" | "ERROR.TYPE" | "ISREF" => ("Information", eval_fn_information_classification::eval_fn_information_classification),
    "FIND" | "SEARCH" | "SUBSTITUTE" | "REPLACE" => ("Text", eval_fn_text_search::eval_fn_text_search),
    "REPT" | "EXACT" | "VALUE" | "T" | "CHAR" | "CODE" | "CLEAN" | "PROPER" | "TEXTJOIN" | "DOLLAR" | "FIXED" | "CONCAT" | "TRANSLATE" | "TEXTSPLIT" | "TEXTBEFORE" | "TEXTAFTER" | "ENCODEURL" => ("Text", eval_fn_text_format::eval_fn_text_format),
    "CHOOSE" | "ADDRESS" | "INDIRECT" | "FORMULATEXT" => ("Lookup & reference", eval_fn_reference_resolution::eval_fn_reference_resolution),
    "XLOOKUP" | "XMATCH" | "LOOKUP" => ("Lookup & reference", eval_fn_lookup_modern::eval_fn_lookup_modern),
    "HOUR" | "MINUTE" | "SECOND" | "TIME" => ("Date & time", eval_fn_date_time::eval_fn_date_time),
    "WEEKDAY" | "WEEKNUM" | "EOMONTH" | "EDATE" | "DAYS" => ("Date & time", eval_fn_date_calendar::eval_fn_date_calendar),
    "DATEDIF" | "DATEVALUE" | "TIMEVALUE" | "YEARFRAC" => ("Date & time", eval_fn_date_duration::eval_fn_date_duration),
    "AVERAGEA" | "RANK" | "RANKEQ" | "RANK.EQ" | "RANKAVG" | "RANK.AVG" | "PERCENTILE" | "PERCENTILE.INC" | "PERCENTILE.EXC" | "QUARTILE" | "QUARTILE.INC" | "QUARTILE.EXC" | "STDEV.S" | "VAR.S" | "STDEV.P" | "VAR.P" | "CORREL" | "COVAR" | "COVAR.P" | "COVAR.S" | "SLOPE" | "INTERCEPT" => ("Math & statistics", eval_fn_statistics_descriptive::eval_fn_statistics_descriptive),
    "PMT" | "PV" | "FV" | "NPER" | "NPV" | "IRR" | "RATE" | "IPMT" | "PPMT" => ("Financial", eval_fn_financial_tvm::eval_fn_financial_tvm),
    "CELL" | "ISFORMULA" | "SHEET" | "SHEETS" | "INFO" => ("Information", eval_fn_information_workbook::eval_fn_information_workbook),
    "DSUM" | "DAVERAGE" | "DCOUNT" | "DCOUNTA" | "DMAX" | "DMIN" | "DPRODUCT" | "DGET" | "DSTDEV" | "DSTDEVP" | "DVAR" | "DVARP" => ("Database", eval_fn_database::eval_fn_database),
    "OCT2DEC" | "HEX2DEC" | "DEC2BIN" | "DEC2OCT" | "DEC2HEX" | "BIN2HEX" | "BIN2OCT" | "HEX2BIN" | "HEX2OCT" | "OCT2BIN" | "OCT2HEX" | "BITAND" | "BITOR" | "BITXOR" | "BITLSHIFT" | "BITRSHIFT" | "DELTA" | "GESTEP" => ("Engineering", eval_fn_engineering_radix::eval_fn_engineering_radix),
    "SINH" | "COSH" | "TANH" | "ASINH" | "ACOSH" | "ATANH" | "CSC" | "SEC" | "COT" | "CSCH" | "SECH" | "COTH" | "ACSC" | "ASEC" | "ACOT" | "ACOTH" => ("Math & statistics", eval_fn_math_hyperbolic::eval_fn_math_hyperbolic),
    "SUMX2MY2" | "SUMX2PY2" | "SUMXMY2" | "SUMSQ" | "SQRTPI" | "SUMPRODUCT" | "FLOOR.MATH" | "CEILING.MATH" | "FLOOR.PRECISE" | "CEILING.PRECISE" | "ROMAN" | "ARABIC" | "DECIMAL" | "BASE" | "ODD" | "EVEN" | "FACTDOUBLE" | "COMBINA" | "MULTINOMIAL" | "SERIESSUM" | "ISO.CEILING" => ("Math & statistics", eval_fn_math_advanced::eval_fn_math_advanced),
    "MDETERM" | "MMULT" | "MINVERSE" | "MUNIT" | "TRANSPOSE" => ("Arrays", eval_fn_array_matrix::eval_fn_array_matrix),
    "NETWORKDAYS" | "NETWORKDAYS.INTL" | "WORKDAY" | "WORKDAY.INTL" | "ISOWEEKNUM" | "DAYS360" => ("Date & time", eval_fn_date_workday::eval_fn_date_workday),
    "SEQUENCE" | "RANDARRAY" => ("Arrays", eval_fn_dynamic_generate::eval_fn_dynamic_generate),
    "UNIQUE" => ("Arrays", eval_fn_dynamic_unique::eval_fn_dynamic_unique),
    "SORT" | "SORTBY" => ("Arrays", eval_fn_dynamic_sort::eval_fn_dynamic_sort),
    "FILTER" => ("Arrays", eval_fn_dynamic_filter::eval_fn_dynamic_filter),
    "MAP" | "REDUCE" | "SCAN" => ("Arrays", eval_fn_dynamic_lambda::eval_fn_dynamic_lambda),
    "BYROW" | "BYCOL" | "MAKEARRAY" => ("Arrays", eval_fn_dynamic_by_axis::eval_fn_dynamic_by_axis),
    "TAKE" | "DROP" | "EXPAND" => ("Arrays", eval_fn_dynamic_shape::eval_fn_dynamic_shape),
    "VSTACK" | "HSTACK" => ("Arrays", eval_fn_dynamic_stack::eval_fn_dynamic_stack),
    "CHOOSEROWS" | "CHOOSECOLS" => ("Arrays", eval_fn_dynamic_selectors::eval_fn_dynamic_selectors),
    "TOROW" | "TOCOL" | "WRAPROWS" | "WRAPCOLS" => ("Arrays", eval_fn_dynamic_flatten::eval_fn_dynamic_flatten),
    "NORM.DIST" | "NORM.INV" | "NORM.S.DIST" | "NORM.S.INV" | "T.DIST" | "T.DIST.RT" | "T.DIST.2T" | "T.INV" | "T.INV.2T" | "F.DIST" | "F.DIST.RT" | "F.INV" | "F.INV.RT" | "CHISQ.DIST" | "CHISQ.DIST.RT" | "CHISQ.INV" | "CHISQ.INV.RT" | "EXPON.DIST" | "WEIBULL.DIST" | "BETA.DIST" | "BETA.INV" | "GAMMA.DIST" | "GAMMA.INV" | "BINOM.DIST" | "BINOM.INV" | "POISSON.DIST" | "HYPGEOM.DIST" | "NEGBINOM.DIST" | "GAMMA" | "GAMMALN" | "ERF" | "ERFC" | "KURT" | "SKEW" | "AVEDEV" | "DEVSQ" | "GEOMEAN" | "HARMEAN" | "TRIMMEAN" | "STANDARDIZE" | "FISHER" | "FISHERINV" | "ERF.PRECISE" | "ERFC.PRECISE" | "GAMMALN.PRECISE" => ("Math & statistics", eval_fn_statistics_distribution::eval_fn_statistics_distribution),
    "SLN" | "SYD" | "DB" | "DDB" | "VDB" | "CUMIPMT" | "CUMPRINC" | "EFFECT" | "NOMINAL" | "ISPMT" => ("Financial", eval_fn_financial_depreciation::eval_fn_financial_depreciation),
    "ACCRINT" | "ACCRINTM" | "DISC" | "INTRATE" | "RECEIVED" | "TBILLEQ" | "TBILLPRICE" | "TBILLYIELD" | "XIRR" | "XNPV" | "MIRR" | "PRICE" | "YIELD" | "DURATION" | "MDURATION" | "PRICEDISC" | "YIELDDISC" | "PRICEMAT" | "YIELDMAT" | "DOLLARDE" | "DOLLARFR" | "COUPDAYBS" | "COUPDAYS" | "COUPNUM" | "AMORDEGRC" | "AMORLINC" | "ODDFPRICE" | "ODDFYIELD" | "ODDLPRICE" | "ODDLYIELD" | "COUPNCD" | "COUPPCD" | "COUPDAYSNC" | "PDURATION" | "RRI" | "FVSCHEDULE" => ("Financial", eval_fn_financial_securities::eval_fn_financial_securities),
    "UNICHAR" | "UNICODE" | "NUMBERVALUE" | "ARRAYTOTEXT" | "VALUETOTEXT" => ("Text", eval_fn_text_conversion::eval_fn_text_conversion),
    #[cfg(feature = "regex-formulas")]
    "REGEXTEST" | "REGEXEXTRACT" | "REGEXREPLACE" => ("Text", eval_fn_text_regex::eval_fn_text_regex),
    "COMPLEX" | "IMABS" | "IMAGINARY" | "IMREAL" | "IMARGUMENT" | "IMCONJUGATE" | "IMSUM" | "IMSUB" | "IMPRODUCT" | "IMDIV" => ("Engineering", eval_fn_engineering_complex_core::eval_fn_engineering_complex_core),
    "IMEXP" | "IMLN" | "IMLOG10" | "IMLOG2" | "IMSQRT" | "IMPOWER" | "IMCOS" | "IMCOSH" | "IMSIN" | "IMSINH" | "IMTAN" | "IMSEC" | "IMCSC" | "IMCOT" | "IMSECH" | "IMCSCH" => ("Engineering", eval_fn_engineering_complex_transforms::eval_fn_engineering_complex_transforms),
    "ASC" | "JIS" | "DBCS" | "PHONETIC" => ("Text", eval_fn_text_east_asian::eval_fn_text_east_asian),
    "HYPERLINK" | "IMAGE" => ("Linked content", eval_fn_linked_content::eval_fn_linked_content),
    "BESSELJ" | "BESSELY" | "BESSELI" | "BESSELK" | "CONVERT" => ("Engineering", eval_fn_engineering_special::eval_fn_engineering_special),
    "LENB" | "LEFTB" | "RIGHTB" | "MIDB" | "FINDB" | "SEARCHB" | "REPLACEB" => ("Text", eval_fn_text_bytes::eval_fn_text_bytes),
    "BETADIST" | "BETAINV" | "BINOMDIST" | "CHIDIST" | "CHIINV" | "CHISQ.TEST" | "CHITEST" | "CONFIDENCE" | "CONFIDENCE.NORM" | "COVARIANCE.P" | "COVARIANCE.S" | "CRITBINOM" | "EXPONDIST" | "FDIST" | "FINV" | "F.TEST" | "FTEST" | "GAMMADIST" | "GAMMAINV" | "HYPGEOMDIST" | "LOGNORM.DIST" | "LOGNORM.INV" | "LOGINV" | "LOGNORMDIST" | "NEGBINOMDIST" | "NORMDIST" | "NORMINV" | "NORMSDIST" | "NORMSINV" | "POISSON" | "TDIST" | "TINV" | "T.TEST" | "TTEST" | "WEIBULL" | "Z.TEST" | "ZTEST" | "STDEVP" | "VARP" | "CONFIDENCE.T" | "BINOM.DIST.RANGE" | "PERMUT" | "PERMUTATIONA" => ("Math & statistics", eval_fn_statistics_legacy_distribution::eval_fn_statistics_legacy_distribution),
    "LINEST" | "LOGEST" | "TREND" | "GROWTH" | "FORECAST" | "FORECAST.LINEAR" | "STEYX" | "RSQ" | "PEARSON" => ("Math & statistics", eval_fn_statistics_regression::eval_fn_statistics_regression),
    "RAND" | "RANDBETWEEN" | "PERCENTRANK" | "PERCENTRANK.INC" | "PERCENTRANK.EXC" | "MODE.SNGL" | "MODE.MULT" | "MAXA" | "MINA" | "STDEVA" | "STDEVPA" | "VARA" | "VARPA" | "SKEW.P" | "FREQUENCY" | "PROB" | "GAUSS" | "PHI" => ("Math & statistics", eval_fn_statistics_legacy_descriptive::eval_fn_statistics_legacy_descriptive),
    "BIN2DEC" => ("Engineering", eval_fn_database::eval_fn_database),
}

/// Resolve a function call `name(args)` against the workbook's defined
/// names when no built-in matched. Only a defined name whose value is a
/// `Value::Lambda` is treated as callable — scalar or range-typed
/// defined names fall through to the host's custom-formula registry
/// (and ultimately `#NAME?` if both miss).
///
/// **Precedence** (post Wave 8 review fix):
///   1. Built-ins (matched in `eval_func` before this fn is reached).
///   2. **Defined-name LAMBDA** — `define_name("SQUARE", "=LAMBDA(x,
///      x*x)")` makes `=SQUARE(5)` resolve through the registry.
///   3. **Host custom formula** — `provider.call_custom(...)`.
///   4. `#NAME?` — no resolution found.
///
/// Earlier shape: ANY defined name (including scalar values and range
/// refs) consumed the name and either applied or returned `#VALUE!`.
/// That meant a host that registered `MYFUNC` AND a defined name
/// `MYFUNC = 42` (or `MYFUNC = $A$1:$B$10`) would see the call resolve
/// to `#VALUE!` instead of falling through to the custom registry. The
/// new shape consults LAMBDA-only at this site; non-LAMBDA defined
/// names remain reachable via bare `Expr::Name` (`=MYFUNC` returns 42
/// or the range) but no longer block the custom-registry fallthrough
/// for `=MYFUNC(...)`.
///
/// Wraps `apply_lambda` in the named-call recursion guard so a runaway
/// recursive definition (`bad` = `LAMBDA(n, bad(n))`) hits `#NUM!` at
/// `MAX_NAMED_CALL_DEPTH` rather than panicking the thread.
///
/// Host custom formulas STILL CANNOT shadow built-ins or a LAMBDA
/// defined name. The reserved-name check in
/// `Workbook::define_name_value` blocks LAMBDA names from colliding
/// with built-ins, and the LAMBDA-only check here preserves the
/// LAMBDA-over-custom precedence.
pub(super) fn eval_named_call(name: &str, args: &[Expr], provider: &dyn EvalProvider) -> Value {
    // 局部 LAMBDA 参数或闭包捕获优先于全局名称；与裸名称求值使用同一作用域。
    let local = lookup_let_binding(name);
    if let Some(value) = local.clone().or_else(|| provider.lookup_named(name)) {
        match &value {
            Value::Lambda(_) => {
                let mut arg_values: Vec<Value> = Vec::with_capacity(args.len());
                for a in args {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = &v {
                        return Value::Error(e.clone());
                    }
                    arg_values.push(v);
                }
                // `apply_lambda` itself owns the recursion guard (see its
                // body) so a recursive defined lambda (`fact` =
                // `LAMBDA(n, IF(n<=1, 1, n*fact(n-1)))`) hits #NUM! at
                // MAX_NAMED_CALL_DEPTH instead of overflowing the stack.
                return apply_lambda(&value, arg_values, provider);
            }
            Value::Error(e) => return Value::Error(e.clone()),
            _ if local.is_some() => return Value::Error(ValueError::WrongType),
            _ => {
                // Non-LAMBDA defined name (`answer = 42`, `MYRANGE =
                // $A$1:$B$10`, etc.). Fall through to the custom-formula
                // registry below so a host's `MYFUNC` registration is
                // not shadowed by an unrelated defined-name entry that
                // happens to share the label.
            }
        }
    }

    // No defined LAMBDA with this label. Try the host's custom-formula
    // registry as a last resort before surfacing #NAME?. Args are eagerly
    // evaluated (custom formulas take Values, not Exprs — no lazy
    // semantics) with two range-arg conveniences:
    //   - A bare `Expr::Range` / `Expr::SheetRange` arg is materialised
    //     to a `Value::Array` via the same path SUM/COUNT use, so the
    //     callback receives a 2-D table rather than `#VALUE!`.
    //   - Any other arg evaluates normally; `Value::Array` results pass
    //     through untouched.
    // Errors short-circuit just like LAMBDA application above, so a
    // custom `MYFUNC(SUM(BAD), 1)` returns the inner error rather than
    // handing the JS callback a `#VALUE!` it would have to handle.
    let mut arg_values: Vec<Value> = Vec::with_capacity(args.len());
    for a in args {
        let v = eval_arg_for_custom(a, provider);
        if let Value::Error(e) = &v {
            return Value::Error(e.clone());
        }
        arg_values.push(v);
    }
    provider
        .call_custom(name, &arg_values)
        .unwrap_or(Value::Error(ValueError::InvalidName))
}

/// Argument-evaluator for the custom-formula dispatch arm. Differs from
/// the default `eval_expr_with_provider` in exactly one way: a bare
/// range expression (`A1:A10`, `Sheet2!B1:B10`, `OFFSET(...)`) is
/// materialised to a `Value::Array` so the JS callback receives the
/// rectangle as a 2-D row-major table. Everything else evaluates to its
/// scalar `Value` (including embedded `Value::Array` results from
/// dynamic-array built-ins like `SEQUENCE`).
///
/// This mirrors what SUM/COUNT/MIN/etc. do at their arg-evaluation
/// sites — they stream the range via `for_each_arg_value`. Custom
/// formulas can't stream (the JS boundary is scalar-in / scalar-out),
/// so we materialise instead. The wire format is documented in
/// `CUSTOM_FORMULAS.md` § "Marshaling".
pub(super) fn eval_arg_for_custom(arg: &Expr, provider: &dyn EvalProvider) -> Value {
    // Range-shaped argument: materialise to `Value::Array` via the
    // shared `arg_to_2d` helper that SUMIF / VLOOKUP / etc. use. The
    // result becomes a `Value::Array` so the WASM marshaling layer
    // round-trips it as a 2-D JS array.
    let is_range_like = matches!(arg, Expr::Range { .. } | Expr::SheetRange { .. })
        || matches!(arg, Expr::FuncCall { name, .. } if name == "OFFSET");
    if is_range_like {
        match arg_to_2d(arg, provider) {
            Ok((0, 0, _)) => {
                // Empty range (over-bound sentinel or zero-cell
                // collection). Surface `#REF!` so the callback isn't
                // handed a 0×0 array it can't reason about.
                return Value::Error(ValueError::InvalidRef);
            }
            Ok((rows, cols, data)) => {
                return Value::Array(Arc::new(ArrayData::new(rows, cols, data)));
            }
            Err(e) => return Value::Error(e),
        }
    }
    eval_expr_with_provider(arg, provider)
}
