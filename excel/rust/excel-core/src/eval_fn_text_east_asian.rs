//! Dispatches text east asian formula functions.

use super::*;

pub(super) fn eval_fn_text_east_asian(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"ASC" => text_unary(args, provider, |s| asc_convert(s)),
        // DBCS is the Excel-2013-era alias for JIS — both widen half-width
        // forms to full-width. We route DBCS through `jis_convert` so the
        // implementations stay in lockstep.
        "JIS" | "DBCS" => text_unary(args, provider, |s| jis_convert(s)),
        // PHONETIC returns ruby/furigana annotation that Excel attaches to
        // cells via an out-of-band sidecar. We don't store ruby metadata, so
        // match the no-annotation fallback and return the source text.
        "PHONETIC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match eval_text_arg(&args[0], provider) {
                Ok(text) => Value::Text(text),
                Err(e) => Value::Error(e),
            }
        }
        // HYPERLINK(link_location, [friendly_name]) — 1 or 2 args.
        // The formula's RESULT is the `friendly_name` (or `link_location` if
        // absent), coerced to text. Excel's UI separately renders the result
        // as a clickable link to `link_location`; that rendering is HOST
        // INTEGRATION (the JS / WASM consumer can detect a HYPERLINK by
        // inspecting the formula text — e.g. `formula.starts_with("=HYPERLINK(")`
        // — and decorate the displayed value accordingly). The Rust core only
        // returns the text label.
        //
        // Error propagation: if either argument evaluates to an Error, the
        // error short-circuits (left-to-right). Empty `link_location` text
        // and no `friendly_name` returns "" (matches Excel parity — Excel
        // shows an empty cell when both are blank).
        //
        // future: WEBSERVICE / FILTERXML are not implemented (require HTTP +
        // XML parsing, out of scope for this batch).
                _ => unreachable!(),
    }
}
