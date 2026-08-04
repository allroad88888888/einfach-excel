#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ConvertCategory {
    Length,
    Mass,
    Time,
    Pressure,
    Energy,
    Power,
    Temperature,
}

/// Lookup a unit symbol used by CONVERT. Returns the (category,
/// factor) pair, where `factor` is "how many base units does one of
/// these equal" (base unit per category: meter, kilogram, second,
/// pascal, joule, watt). Temperature units are flagged via
/// `ConvertCategory::Temperature`; their conversions are affine, not
/// linear, so the factor field is meaningless and the special-cased
/// `convert_temperature` is used instead.
///
/// Future expansion: Excel's CONVERT supports hundreds of unit
/// symbols and a metric-prefix expansion grammar (k, M, G, m, u, n,
/// etc.) that can be stacked on any "metric-prefixable" base. We ship
/// a representative subset here and only the bare symbols. Metric
/// prefixing for arbitrary bases is not supported in this revision —
/// only the explicit table entries below.
pub(super) fn convert_unit_factor(unit: &str) -> Option<(ConvertCategory, f64)> {
    // NOTE: Excel CONVERT is *case-sensitive* for most units (`g` is
    // gram, `G` is the giga prefix). We follow that — match exactly.
    use ConvertCategory::*;
    Some(match unit {
        // Length (base = meter)
        "m" => (Length, 1.0),
        "km" => (Length, 1_000.0),
        "cm" => (Length, 0.01),
        "mm" => (Length, 0.001),
        "in" => (Length, 0.0254),
        "ft" => (Length, 0.3048),
        "yd" => (Length, 0.9144),
        "mi" => (Length, 1609.344),
        "Nmi" | "nmi" => (Length, 1852.0),

        // Mass / Weight (base = kilogram)
        "kg" => (Mass, 1.0),
        "g" => (Mass, 0.001),
        "mg" => (Mass, 1e-6),
        "lbm" => (Mass, 0.45359237),
        "ozm" => (Mass, 0.028349523125),
        "ton" => (Mass, 907.18474), // US short ton

        // Time (base = second)
        "sec" | "s" => (Time, 1.0),
        "mn" | "min" => (Time, 60.0),
        "hr" => (Time, 3600.0),
        "day" | "d" => (Time, 86_400.0),
        "yr" => (Time, 31_557_600.0), // Excel's Julian year (365.25 days)

        // Pressure (base = pascal)
        "Pa" => (Pressure, 1.0),
        "atm" => (Pressure, 101_325.0),
        "mmHg" => (Pressure, 133.322387415),
        "psi" => (Pressure, 6_894.757293168),

        // Energy (base = joule)
        "J" => (Energy, 1.0),
        "cal" => (Energy, 4.184),
        "kWh" | "wh" => (Energy, 3_600_000.0),
        "BTU" | "btu" => (Energy, 1_055.05585262),
        "eV" | "ev" => (Energy, 1.602176634e-19),

        // Power (base = watt)
        "W" | "w" => (Power, 1.0),
        "HP" | "h" => (Power, 745.69987158227022),
        "PS" => (Power, 735.49875),

        // Temperature is special (affine, not linear). The factor here
        // is unused; the `convert_temperature` path handles the
        // arithmetic explicitly. We still need distinct entries so the
        // lookup succeeds.
        "C" | "cel" => (Temperature, 0.0),
        "F" | "fah" => (Temperature, 1.0),
        "K" | "kel" => (Temperature, 2.0),

        _ => return None,
    })
}
