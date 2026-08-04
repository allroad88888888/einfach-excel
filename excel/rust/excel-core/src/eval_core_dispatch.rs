use super::*;

pub(super) fn eval_func(name: &str, args: &[Expr], provider: &dyn EvalProvider) -> Value {
    match name {
        "LET" | "LAMBDA" | "ISOMITTED" => eval_fn_lambda::eval_fn_lambda(name, args, provider),
        "SUM" | "AVERAGE" | "COUNT" | "MIN" | "MAX" | "COUNTA" | "COUNTBLANK" | "SUBTOTAL" | "AGGREGATE" => eval_fn_aggregate_core::eval_fn_aggregate_core(name, args, provider),
        "IF" | "AND" | "OR" | "NOT" | "IFERROR" | "IFNA" | "IFS" | "SWITCH" | "XOR" | "TRUE" | "FALSE" | "NA" => eval_fn_logical::eval_fn_logical(name, args, provider),
        "ABS" | "SQRT" | "ROUND" | "CEILING" | "FLOOR" | "POWER" | "MOD" => eval_fn_math_basic::eval_fn_math_basic(name, args, provider),
        "CONCATENATE" | "LEN" | "LEFT" | "RIGHT" | "MID" | "UPPER" | "LOWER" | "TRIM" | "TEXT" => eval_fn_text_basic::eval_fn_text_basic(name, args, provider),
        "COUNTIF" | "SUMIF" | "AVERAGEIF" | "COUNTIFS" | "SUMIFS" | "AVERAGEIFS" | "MAXIFS" | "MINIFS" => eval_fn_criteria::eval_fn_criteria(name, args, provider),
        "VLOOKUP" | "HLOOKUP" | "INDEX" | "MATCH" => eval_fn_lookup_classic::eval_fn_lookup_classic(name, args, provider),
        "MEDIAN" | "MODE" | "STDEV" | "VAR" | "LARGE" | "SMALL" => eval_fn_statistics_core::eval_fn_statistics_core(name, args, provider),
        "TODAY" | "NOW" | "DATE" | "YEAR" | "MONTH" | "DAY" => eval_fn_date_basic::eval_fn_date_basic(name, args, provider),
        "OFFSET" | "ROW" | "COLUMN" | "ROWS" | "COLUMNS" | "AREAS" => eval_fn_reference_position::eval_fn_reference_position(name, args, provider),
        "INT" | "TRUNC" | "SIGN" | "EXP" | "LN" | "LOG" | "LOG10" | "PI" | "ROUNDUP" | "ROUNDDOWN" | "MROUND" => eval_fn_math_rounding::eval_fn_math_rounding(name, args, provider),
        "PRODUCT" | "QUOTIENT" | "FACT" | "COMBIN" | "GCD" | "LCM" => eval_fn_math_combinatorics::eval_fn_math_combinatorics(name, args, provider),
        "SIN" | "COS" | "TAN" | "ASIN" | "ACOS" | "ATAN" | "ATAN2" | "RADIANS" | "DEGREES" => eval_fn_math_trigonometry::eval_fn_math_trigonometry(name, args, provider),
        "ISNUMBER" | "ISTEXT" | "ISBLANK" | "ISERROR" | "ISERR" | "ISNA" | "ISLOGICAL" | "ISNONTEXT" | "ISEVEN" | "ISODD" | "N" | "TYPE" | "ERROR.TYPE" | "ISREF" => eval_fn_information_classification::eval_fn_information_classification(name, args, provider),
        "FIND" | "SEARCH" | "SUBSTITUTE" | "REPLACE" => eval_fn_text_search::eval_fn_text_search(name, args, provider),
        "REPT" | "EXACT" | "VALUE" | "T" | "CHAR" | "CODE" | "CLEAN" | "PROPER" | "TEXTJOIN" | "DOLLAR" | "FIXED" | "CONCAT" | "TRANSLATE" | "TEXTSPLIT" | "TEXTBEFORE" | "TEXTAFTER" | "ENCODEURL" => eval_fn_text_format::eval_fn_text_format(name, args, provider),
        "CHOOSE" | "ADDRESS" | "INDIRECT" | "FORMULATEXT" => eval_fn_reference_resolution::eval_fn_reference_resolution(name, args, provider),
        "XLOOKUP" | "XMATCH" | "LOOKUP" => eval_fn_lookup_modern::eval_fn_lookup_modern(name, args, provider),
        "HOUR" | "MINUTE" | "SECOND" | "TIME" => eval_fn_date_time::eval_fn_date_time(name, args, provider),
        "WEEKDAY" | "WEEKNUM" | "EOMONTH" | "EDATE" | "DAYS" => eval_fn_date_calendar::eval_fn_date_calendar(name, args, provider),
        "DATEDIF" | "DATEVALUE" | "TIMEVALUE" | "YEARFRAC" => eval_fn_date_duration::eval_fn_date_duration(name, args, provider),
        "AVERAGEA" | "RANK" | "RANKEQ" | "RANK.EQ" | "RANKAVG" | "RANK.AVG" | "PERCENTILE" | "PERCENTILE.INC" | "PERCENTILE.EXC" | "QUARTILE" | "QUARTILE.INC" | "QUARTILE.EXC" | "STDEV.S" | "VAR.S" | "STDEV.P" | "VAR.P" | "CORREL" | "COVAR" | "COVAR.P" | "COVAR.S" | "SLOPE" | "INTERCEPT" => eval_fn_statistics_descriptive::eval_fn_statistics_descriptive(name, args, provider),
        "PMT" | "PV" | "FV" | "NPER" | "NPV" | "IRR" | "RATE" | "IPMT" | "PPMT" => eval_fn_financial_tvm::eval_fn_financial_tvm(name, args, provider),
        "CELL" | "ISFORMULA" | "SHEET" | "SHEETS" | "INFO" => eval_fn_information_workbook::eval_fn_information_workbook(name, args, provider),
        "DSUM" | "DAVERAGE" | "DCOUNT" | "DCOUNTA" | "DMAX" | "DMIN" | "DPRODUCT" | "DGET" | "DSTDEV" | "DSTDEVP" | "DVAR" | "DVARP" | "BIN2DEC" => eval_fn_database::eval_fn_database(name, args, provider),
        "OCT2DEC" | "HEX2DEC" | "DEC2BIN" | "DEC2OCT" | "DEC2HEX" | "BIN2HEX" | "BIN2OCT" | "HEX2BIN" | "HEX2OCT" | "OCT2BIN" | "OCT2HEX" | "BITAND" | "BITOR" | "BITXOR" | "BITLSHIFT" | "BITRSHIFT" | "DELTA" | "GESTEP" => eval_fn_engineering_radix::eval_fn_engineering_radix(name, args, provider),
        "SINH" | "COSH" | "TANH" | "ASINH" | "ACOSH" | "ATANH" | "CSC" | "SEC" | "COT" | "CSCH" | "SECH" | "COTH" | "ACSC" | "ASEC" | "ACOT" | "ACOTH" => eval_fn_math_hyperbolic::eval_fn_math_hyperbolic(name, args, provider),
        "SUMX2MY2" | "SUMX2PY2" | "SUMXMY2" | "SUMSQ" | "SQRTPI" | "SUMPRODUCT" | "FLOOR.MATH" | "CEILING.MATH" | "FLOOR.PRECISE" | "CEILING.PRECISE" | "ROMAN" | "ARABIC" | "DECIMAL" | "BASE" | "ODD" | "EVEN" | "FACTDOUBLE" | "COMBINA" | "MULTINOMIAL" | "SERIESSUM" | "ISO.CEILING" => eval_fn_math_advanced::eval_fn_math_advanced(name, args, provider),
        "MDETERM" | "MMULT" | "MINVERSE" | "MUNIT" | "TRANSPOSE" => eval_fn_array_matrix::eval_fn_array_matrix(name, args, provider),
        "NETWORKDAYS" | "NETWORKDAYS.INTL" | "WORKDAY" | "WORKDAY.INTL" | "ISOWEEKNUM" | "DAYS360" => eval_fn_date_workday::eval_fn_date_workday(name, args, provider),
        "SEQUENCE" | "RANDARRAY" => eval_fn_dynamic_generate::eval_fn_dynamic_generate(name, args, provider),
        "UNIQUE" => eval_fn_dynamic_unique::eval_fn_dynamic_unique(name, args, provider),
        "SORT" | "SORTBY" => eval_fn_dynamic_sort::eval_fn_dynamic_sort(name, args, provider),
        "FILTER" => eval_fn_dynamic_filter::eval_fn_dynamic_filter(name, args, provider),
        "MAP" | "REDUCE" | "SCAN" => eval_fn_dynamic_lambda::eval_fn_dynamic_lambda(name, args, provider),
        "BYROW" | "BYCOL" | "MAKEARRAY" => eval_fn_dynamic_by_axis::eval_fn_dynamic_by_axis(name, args, provider),
        "TAKE" | "DROP" | "EXPAND" => eval_fn_dynamic_shape::eval_fn_dynamic_shape(name, args, provider),
        "VSTACK" | "HSTACK" => eval_fn_dynamic_stack::eval_fn_dynamic_stack(name, args, provider),
        "CHOOSEROWS" | "CHOOSECOLS" => eval_fn_dynamic_selectors::eval_fn_dynamic_selectors(name, args, provider),
        "TOROW" | "TOCOL" | "WRAPROWS" | "WRAPCOLS" => eval_fn_dynamic_flatten::eval_fn_dynamic_flatten(name, args, provider),
        "NORM.DIST" | "NORM.INV" | "NORM.S.DIST" | "NORM.S.INV" | "T.DIST" | "T.DIST.RT" | "T.DIST.2T" | "T.INV" | "T.INV.2T" | "F.DIST" | "F.DIST.RT" | "F.INV" | "F.INV.RT" | "CHISQ.DIST" | "CHISQ.DIST.RT" | "CHISQ.INV" | "CHISQ.INV.RT" | "EXPON.DIST" | "WEIBULL.DIST" | "BETA.DIST" | "BETA.INV" | "GAMMA.DIST" | "GAMMA.INV" | "BINOM.DIST" | "BINOM.INV" | "POISSON.DIST" | "HYPGEOM.DIST" | "NEGBINOM.DIST" | "GAMMA" | "GAMMALN" | "ERF" | "ERFC" | "KURT" | "SKEW" | "AVEDEV" | "DEVSQ" | "GEOMEAN" | "HARMEAN" | "TRIMMEAN" | "STANDARDIZE" | "FISHER" | "FISHERINV" | "ERF.PRECISE" | "ERFC.PRECISE" | "GAMMALN.PRECISE" => eval_fn_statistics_distribution::eval_fn_statistics_distribution(name, args, provider),
        "SLN" | "SYD" | "DB" | "DDB" | "VDB" | "CUMIPMT" | "CUMPRINC" | "EFFECT" | "NOMINAL" | "ISPMT" => eval_fn_financial_depreciation::eval_fn_financial_depreciation(name, args, provider),
        "ACCRINT" | "ACCRINTM" | "DISC" | "INTRATE" | "RECEIVED" | "TBILLEQ" | "TBILLPRICE" | "TBILLYIELD" | "XIRR" | "XNPV" | "MIRR" | "PRICE" | "YIELD" | "DURATION" | "MDURATION" | "PRICEDISC" | "YIELDDISC" | "PRICEMAT" | "YIELDMAT" | "DOLLARDE" | "DOLLARFR" | "COUPDAYBS" | "COUPDAYS" | "COUPNUM" | "AMORDEGRC" | "AMORLINC" | "ODDFPRICE" | "ODDFYIELD" | "ODDLPRICE" | "ODDLYIELD" | "COUPNCD" | "COUPPCD" | "COUPDAYSNC" | "PDURATION" | "RRI" | "FVSCHEDULE" => eval_fn_financial_securities::eval_fn_financial_securities(name, args, provider),
        "UNICHAR" | "UNICODE" | "NUMBERVALUE" | "ARRAYTOTEXT" | "VALUETOTEXT" => eval_fn_text_conversion::eval_fn_text_conversion(name, args, provider),
        #[cfg(feature = "regex-formulas")]
        "REGEXTEST" | "REGEXEXTRACT" | "REGEXREPLACE" => eval_fn_text_regex::eval_fn_text_regex(name, args, provider),
        "COMPLEX" | "IMABS" | "IMAGINARY" | "IMREAL" | "IMARGUMENT" | "IMCONJUGATE" | "IMSUM" | "IMSUB" | "IMPRODUCT" | "IMDIV" => eval_fn_engineering_complex_core::eval_fn_engineering_complex_core(name, args, provider),
        "IMEXP" | "IMLN" | "IMLOG10" | "IMLOG2" | "IMSQRT" | "IMPOWER" | "IMCOS" | "IMCOSH" | "IMSIN" | "IMSINH" | "IMTAN" | "IMSEC" | "IMCSC" | "IMCOT" | "IMSECH" | "IMCSCH" => eval_fn_engineering_complex_transforms::eval_fn_engineering_complex_transforms(name, args, provider),
        "ASC" | "JIS" | "DBCS" | "PHONETIC" => eval_fn_text_east_asian::eval_fn_text_east_asian(name, args, provider),
        "HYPERLINK" | "IMAGE" => eval_fn_linked_content::eval_fn_linked_content(name, args, provider),
        "BESSELJ" | "BESSELY" | "BESSELI" | "BESSELK" | "CONVERT" => eval_fn_engineering_special::eval_fn_engineering_special(name, args, provider),
        "LENB" | "LEFTB" | "RIGHTB" | "MIDB" | "FINDB" | "SEARCHB" | "REPLACEB" => eval_fn_text_bytes::eval_fn_text_bytes(name, args, provider),
        "BETADIST" | "BETAINV" | "BINOMDIST" | "CHIDIST" | "CHIINV" | "CHISQ.TEST" | "CHITEST" | "CONFIDENCE" | "CONFIDENCE.NORM" | "COVARIANCE.P" | "COVARIANCE.S" | "CRITBINOM" | "EXPONDIST" | "FDIST" | "FINV" | "F.TEST" | "FTEST" | "GAMMADIST" | "GAMMAINV" | "HYPGEOMDIST" | "LOGNORM.DIST" | "LOGNORM.INV" | "LOGINV" | "LOGNORMDIST" | "NEGBINOMDIST" | "NORMDIST" | "NORMINV" | "NORMSDIST" | "NORMSINV" | "POISSON" | "TDIST" | "TINV" | "T.TEST" | "TTEST" | "WEIBULL" | "Z.TEST" | "ZTEST" | "STDEVP" | "VARP" | "CONFIDENCE.T" | "BINOM.DIST.RANGE" | "PERMUT" | "PERMUTATIONA" => eval_fn_statistics_legacy_distribution::eval_fn_statistics_legacy_distribution(name, args, provider),
        "LINEST" | "LOGEST" | "TREND" | "GROWTH" | "FORECAST" | "FORECAST.LINEAR" | "STEYX" | "RSQ" | "PEARSON" => eval_fn_statistics_regression::eval_fn_statistics_regression(name, args, provider),
        "RAND" | "RANDBETWEEN" | "PERCENTRANK" | "PERCENTRANK.INC" | "PERCENTRANK.EXC" | "MODE.SNGL" | "MODE.MULT" | "MAXA" | "MINA" | "STDEVA" | "STDEVPA" | "VARA" | "VARPA" | "SKEW.P" | "FREQUENCY" | "PROB" | "GAUSS" | "PHI" => eval_fn_statistics_legacy_descriptive::eval_fn_statistics_legacy_descriptive(name, args, provider),
        _ => eval_named_call(name, args, provider),
    }
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
    if let Some(value) = provider.lookup_named(name) {
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
