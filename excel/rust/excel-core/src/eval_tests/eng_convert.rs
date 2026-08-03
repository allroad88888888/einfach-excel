//! CONVERT 的单位换算表。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn convert_length() {
    // 1 yard = 0.9144 metre exactly.
    assert_approx_eq(ev(r#"=CONVERT(1, "yd", "m")"#), 0.9144, 1e-9);
    // 100 cm = 1 m.
    assert_approx_eq(ev(r#"=CONVERT(100, "cm", "m")"#), 1.0, 1e-9);
    // 1 mile = 1609.344 m.
    assert_approx_eq(ev(r#"=CONVERT(1, "mi", "m")"#), 1609.344, 1e-6);
    // 1 inch = 2.54 cm.
    assert_approx_eq(ev(r#"=CONVERT(1, "in", "cm")"#), 2.54, 1e-9);
}

#[test]
fn convert_mass() {
    // 1 kg ≈ 2.20462 lbm.
    assert_approx_eq(ev(r#"=CONVERT(1, "kg", "lbm")"#), 2.20462262185, 1e-6);
    // 1 ton = 2000 lbm (US short ton, by definition: 907.18474 kg).
    assert_approx_eq(ev(r#"=CONVERT(1, "ton", "lbm")"#), 2000.0, 1e-3);
}

#[test]
fn convert_time() {
    assert_approx_eq(ev(r#"=CONVERT(60, "sec", "mn")"#), 1.0, 1e-9);
    assert_approx_eq(ev(r#"=CONVERT(1, "hr", "sec")"#), 3600.0, 1e-9);
    assert_approx_eq(ev(r#"=CONVERT(1, "day", "hr")"#), 24.0, 1e-9);
}

#[test]
fn convert_pressure() {
    assert_approx_eq(ev(r#"=CONVERT(1, "atm", "Pa")"#), 101325.0, 1e-3);
    assert_approx_eq(ev(r#"=CONVERT(1, "psi", "Pa")"#), 6894.757293168, 1e-3);
}

#[test]
fn convert_energy_power() {
    assert_approx_eq(ev(r#"=CONVERT(1, "cal", "J")"#), 4.184, 1e-9);
    assert_approx_eq(ev(r#"=CONVERT(1, "kWh", "J")"#), 3_600_000.0, 1e-3);
    assert_approx_eq(ev(r#"=CONVERT(1, "HP", "W")"#), 745.69987158227022, 1e-3);
}

#[test]
fn convert_temperature() {
    // Boiling point: 100C = 212F = 373.15K.
    assert_approx_eq(ev(r#"=CONVERT(212, "F", "C")"#), 100.0, 1e-9);
    assert_approx_eq(ev(r#"=CONVERT(100, "C", "F")"#), 212.0, 1e-9);
    assert_approx_eq(ev(r#"=CONVERT(0, "C", "K")"#), 273.15, 1e-9);
    assert_approx_eq(ev(r#"=CONVERT(273.15, "K", "C")"#), 0.0, 1e-9);
    // Cross conversion F <-> K.
    assert_approx_eq(ev(r#"=CONVERT(32, "F", "K")"#), 273.15, 1e-9);
}

#[test]
fn convert_errors() {
    // Incompatible categories -> `#VALUE!` (project's stand-in for #N/A).
    assert_eq!(
        ev(r#"=CONVERT(1, "kg", "sec")"#),
        Value::Error(ValueError::InvalidValue)
    );
    // Unknown unit -> same error.
    assert_eq!(
        ev(r#"=CONVERT(1, "frobnicate", "m")"#),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count error.
    assert_eq!(
        ev(r#"=CONVERT(1, "m")"#),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        ev(r#"=CONVERT(1, "m", "cm", "extra")"#),
        Value::Error(ValueError::WrongArgCount)
    );
}
