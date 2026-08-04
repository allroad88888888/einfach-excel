//! Dispatches financial securities formula functions.

use super::*;

pub(super) fn eval_fn_financial_securities(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"ACCRINT" => fn_accrint(args, provider),
        "ACCRINTM" => fn_accrintm(args, provider),
        "DISC" => fn_disc(args, provider),
        "INTRATE" => fn_intrate(args, provider),
        "RECEIVED" => fn_received(args, provider),
        "TBILLEQ" => fn_tbilleq(args, provider),
        "TBILLPRICE" => fn_tbillprice(args, provider),
        "TBILLYIELD" => fn_tbillyield(args, provider),
        "XIRR" => fn_xirr(args, provider),
        "XNPV" => fn_xnpv(args, provider),
        "MIRR" => fn_mirr(args, provider),
        "PRICE" => fn_price(args, provider),
        "YIELD" => fn_yield(args, provider),
        "DURATION" => fn_duration(args, provider),
        "MDURATION" => fn_mduration(args, provider),
        "PRICEDISC" => fn_pricedisc(args, provider),
        "YIELDDISC" => fn_yielddisc(args, provider),
        "PRICEMAT" => fn_pricemat(args, provider),
        "YIELDMAT" => fn_yieldmat(args, provider),
        "DOLLARDE" => fn_dollarde(args, provider),
        "DOLLARFR" => fn_dollarfr(args, provider),
        "COUPDAYBS" => fn_coupdaybs(args, provider),
        "COUPDAYS" => fn_coupdays(args, provider),
        "COUPNUM" => fn_coupnum(args, provider),
        "AMORDEGRC" => fn_amordegrc(args, provider),
        "AMORLINC" => fn_amorlinc(args, provider),
        "ODDFPRICE" => fn_oddfprice(args, provider),
        "ODDFYIELD" => fn_oddfyield(args, provider),
        "ODDLPRICE" => fn_oddlprice(args, provider),
        "ODDLYIELD" => fn_oddlyield(args, provider),
        "COUPNCD" => fn_coupncd(args, provider),
        "COUPPCD" => fn_couppcd(args, provider),
        "COUPDAYSNC" => fn_coupdaysnc(args, provider),
        "PDURATION" => fn_pduration(args, provider),
        "RRI" => fn_rri(args, provider),
        "FVSCHEDULE" => fn_fvschedule(args, provider),

        // === R batch: CJK byte-aware text functions ===
        // Each treats CJK / full-width characters as 2 "bytes" wide and
        // ASCII / half-width as 1 (Excel Shift-JIS / DBCS parity).
        // `dbcs_byte_width` is the shared decision.
                _ => unreachable!(),
    }
}
