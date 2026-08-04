// 求值器实现模块注册表。

// The REGEX* built-ins (REGEXTEST / REGEXEXTRACT / REGEXREPLACE) and the
// compiled-regex cache they share. Gating the whole module here is what keeps
// the `regex` crate out of the lite wasm build — see the `regex-formulas`
// feature in `Cargo.toml`. The only other `#[cfg]`s the feature needs are the
// three dispatch arms in `eval_func`. `#[path]` keeps the file flat in `src/`
// alongside the crate's other modules while leaving it a child of `eval`, so
// it can use this module's private helpers without widening their visibility.
#[cfg(feature = "regex-formulas")]
#[path = "eval_regex.rs"] mod eval_regex;

// WRAPROWS / WRAPCOLS。同样用 `#[path]` 平铺在 `src/`、仍是 `eval` 的子模块，
// 理由与上面那块一致，外加一条：本文件已经三万九千行，远超本仓 500 行上限，
// 新增内建不该继续往里堆。无 `#[cfg]` —— 这两个不属于任何 feature 门控。
#[path = "eval_wrap.rs"] mod eval_wrap;

// 条件聚合家族（COUNTIF/SUMIF/AVERAGEIF/COUNTIFS/SUMIFS/AVERAGEIFS/MAXIFS/
// MINIFS）。拆成两块：`_blank` 是「不物化空格地枚举候选位置」这一个抽象，
// `_family` 是八个函数各自的折叠体。`#[path]` 约定同上两块。
#[path = "eval_criteria_blank.rs"] mod eval_criteria_blank;
#[path = "eval_criteria_family.rs"] mod eval_criteria_family;

#[path = "eval_fn_aggregate_core.rs"] mod eval_fn_aggregate_core;
#[path = "eval_fn_array_matrix.rs"] mod eval_fn_array_matrix;
#[path = "eval_fn_criteria.rs"] mod eval_fn_criteria;
#[path = "eval_fn_database.rs"] mod eval_fn_database;
#[path = "eval_fn_date_basic.rs"] mod eval_fn_date_basic;
#[path = "eval_fn_date_calendar.rs"] mod eval_fn_date_calendar;
#[path = "eval_fn_date_duration.rs"] mod eval_fn_date_duration;
#[path = "eval_fn_date_time.rs"] mod eval_fn_date_time;
#[path = "eval_fn_date_workday.rs"] mod eval_fn_date_workday;
#[path = "eval_fn_dynamic_by_axis.rs"] mod eval_fn_dynamic_by_axis;
#[path = "eval_fn_dynamic_filter.rs"] mod eval_fn_dynamic_filter;
#[path = "eval_fn_dynamic_flatten.rs"] mod eval_fn_dynamic_flatten;
#[path = "eval_fn_dynamic_generate.rs"] mod eval_fn_dynamic_generate;
#[path = "eval_fn_dynamic_lambda.rs"] mod eval_fn_dynamic_lambda;
#[path = "eval_fn_dynamic_selectors.rs"] mod eval_fn_dynamic_selectors;
#[path = "eval_fn_dynamic_shape.rs"] mod eval_fn_dynamic_shape;
#[path = "eval_fn_dynamic_sort.rs"] mod eval_fn_dynamic_sort;
#[path = "eval_fn_dynamic_stack.rs"] mod eval_fn_dynamic_stack;
#[path = "eval_fn_dynamic_unique.rs"] mod eval_fn_dynamic_unique;
#[path = "eval_fn_engineering_complex_core.rs"] mod eval_fn_engineering_complex_core;
#[path = "eval_fn_engineering_complex_transforms.rs"] mod eval_fn_engineering_complex_transforms;
#[path = "eval_fn_engineering_radix.rs"] mod eval_fn_engineering_radix;
#[path = "eval_fn_engineering_special.rs"] mod eval_fn_engineering_special;
#[path = "eval_fn_financial_depreciation.rs"] mod eval_fn_financial_depreciation;
#[path = "eval_fn_financial_securities.rs"] mod eval_fn_financial_securities;
#[path = "eval_fn_financial_tvm.rs"] mod eval_fn_financial_tvm;
#[path = "eval_fn_information_classification.rs"] mod eval_fn_information_classification;
#[path = "eval_fn_information_workbook.rs"] mod eval_fn_information_workbook;
#[path = "eval_fn_lambda.rs"] mod eval_fn_lambda;
#[path = "eval_fn_linked_content.rs"] mod eval_fn_linked_content;
#[path = "eval_fn_logical.rs"] mod eval_fn_logical;
#[path = "eval_fn_lookup_classic.rs"] mod eval_fn_lookup_classic;
#[path = "eval_fn_lookup_modern.rs"] mod eval_fn_lookup_modern;
#[path = "eval_lookup_range_grid.rs"] mod eval_lookup_range_grid;
#[path = "eval_fn_math_advanced.rs"] mod eval_fn_math_advanced;
#[path = "eval_fn_math_basic.rs"] mod eval_fn_math_basic;
#[path = "eval_fn_math_combinatorics.rs"] mod eval_fn_math_combinatorics;
#[path = "eval_fn_math_hyperbolic.rs"] mod eval_fn_math_hyperbolic;
#[path = "eval_fn_math_rounding.rs"] mod eval_fn_math_rounding;
#[path = "eval_fn_math_trigonometry.rs"] mod eval_fn_math_trigonometry;
#[path = "eval_fn_reference_position.rs"] mod eval_fn_reference_position;
#[path = "eval_fn_reference_resolution.rs"] mod eval_fn_reference_resolution;

#[path = "eval_statistics_descriptive.rs"] mod eval_statistics_descriptive;
#[path = "eval_statistics_distribution_normal.rs"] mod eval_statistics_distribution_normal;
#[path = "eval_statistics_distribution_t_f.rs"] mod eval_statistics_distribution_t_f;
#[path = "eval_statistics_distribution_chisq_expon_weibull.rs"] mod eval_statistics_distribution_chisq_expon_weibull;
#[path = "eval_statistics_distribution_beta_gamma.rs"] mod eval_statistics_distribution_beta_gamma;
#[path = "eval_statistics_distribution_discrete.rs"] mod eval_statistics_distribution_discrete;
#[path = "eval_statistics_distribution_special.rs"] mod eval_statistics_distribution_special;
#[path = "eval_statistics_legacy_distribution.rs"] mod eval_statistics_legacy_distribution;
#[path = "eval_statistics_hypothesis.rs"] mod eval_statistics_hypothesis;
#[path = "eval_statistics_regression_matrix.rs"] mod eval_statistics_regression_matrix;
#[path = "eval_statistics_regression_fit.rs"] mod eval_statistics_regression_fit;
#[path = "eval_statistics_regression_output.rs"] mod eval_statistics_regression_output;
#[path = "eval_statistics_regression_inputs.rs"] mod eval_statistics_regression_inputs;
#[path = "eval_statistics_descriptive_extended.rs"] mod eval_statistics_descriptive_extended;
#[path = "eval_statistics_distribution_probability.rs"] mod eval_statistics_distribution_probability;
#[path = "eval_statistics_hypothesis_extra.rs"] mod eval_statistics_hypothesis_extra;
#[path = "eval_statistics_regression_linear.rs"] mod eval_statistics_regression_linear;
#[path = "eval_statistics_regression_scalars.rs"] mod eval_statistics_regression_scalars;
#[path = "eval_statistics_matrix_functions.rs"] mod eval_statistics_matrix_functions;
#[path = "eval_financial_tvm_core.rs"] mod eval_financial_tvm_core;
#[path = "eval_financial_tvm_basic.rs"] mod eval_financial_tvm_basic;
#[path = "eval_financial_tvm_investment.rs"] mod eval_financial_tvm_investment;
#[path = "eval_financial_tvm_payment.rs"] mod eval_financial_tvm_payment;
#[path = "eval_engineering_radix_core.rs"] mod eval_engineering_radix_core;
#[path = "eval_engineering_radix_conversion.rs"] mod eval_engineering_radix_conversion;
#[path = "eval_engineering_radix_bitwise.rs"] mod eval_engineering_radix_bitwise;
#[path = "eval_math_aggregate.rs"] mod eval_math_aggregate;
#[path = "eval_math_rounding.rs"] mod eval_math_rounding;
#[path = "eval_engineering_radix_roman.rs"] mod eval_engineering_radix_roman;
#[path = "eval_engineering_radix_decimal.rs"] mod eval_engineering_radix_decimal;
#[path = "eval_statistics_matrix_determinant.rs"] mod eval_statistics_matrix_determinant;
#[path = "eval_date_workday_calculation.rs"] mod eval_date_workday_calculation;
#[path = "eval_financial_depreciation_basis.rs"] mod eval_financial_depreciation_basis;
#[path = "eval_financial_depreciation_declining.rs"] mod eval_financial_depreciation_declining;
#[path = "eval_financial_depreciation_vdb.rs"] mod eval_financial_depreciation_vdb;
#[path = "eval_financial_tvm_cumulative.rs"] mod eval_financial_tvm_cumulative;
#[path = "eval_financial_securities_accrual.rs"] mod eval_financial_securities_accrual;
#[path = "eval_financial_securities_tbill.rs"] mod eval_financial_securities_tbill;
#[path = "eval_financial_investment_xirr.rs"] mod eval_financial_investment_xirr;
#[path = "eval_financial_securities_coupon.rs"] mod eval_financial_securities_coupon;
#[path = "eval_financial_securities_price.rs"] mod eval_financial_securities_price;
#[path = "eval_financial_securities_duration.rs"] mod eval_financial_securities_duration;
#[path = "eval_financial_securities_discmat.rs"] mod eval_financial_securities_discmat;
#[path = "eval_financial_securities_dollar_coupon.rs"] mod eval_financial_securities_dollar_coupon;
#[path = "eval_financial_depreciation_amortized.rs"] mod eval_financial_depreciation_amortized;
#[path = "eval_financial_securities_odd_first.rs"] mod eval_financial_securities_odd_first;
#[path = "eval_financial_securities_odd_first_yield.rs"] mod eval_financial_securities_odd_first_yield;
#[path = "eval_financial_securities_odd_last.rs"] mod eval_financial_securities_odd_last;
#[path = "eval_financial_securities_coupon_dates.rs"] mod eval_financial_securities_coupon_dates;
#[path = "eval_financial_investment_schedule.rs"] mod eval_financial_investment_schedule;
#[path = "eval_text_dbcs_bytes.rs"] mod eval_text_dbcs_bytes;
#[path = "eval_text_dbcs_functions.rs"] mod eval_text_dbcs_functions;
#[path = "eval_statistics_matrix_conversion.rs"] mod eval_statistics_matrix_conversion;
#[path = "eval_text_dbcs_search.rs"] mod eval_text_dbcs_search;
#[path = "eval_text_unicode.rs"] mod eval_text_unicode;
#[path = "eval_text_render_values.rs"] mod eval_text_render_values;
#[path = "eval_text_render_grid.rs"] mod eval_text_render_grid;
#[path = "eval_information_workbook_helpers.rs"] mod eval_information_workbook_helpers;
#[path = "eval_engineering_complex_parse.rs"] mod eval_engineering_complex_parse;
#[path = "eval_engineering_complex_arithmetic.rs"] mod eval_engineering_complex_arithmetic;
#[path = "eval_text_east_asian_width.rs"] mod eval_text_east_asian_width;
#[path = "eval_text_east_asian_kana.rs"] mod eval_text_east_asian_kana;
#[path = "eval_information_image_format.rs"] mod eval_information_image_format;
#[path = "eval_engineering_bessel_eval.rs"] mod eval_engineering_bessel_eval;
#[path = "eval_engineering_bessel_ordered.rs"] mod eval_engineering_bessel_ordered;
#[path = "eval_engineering_bessel_base.rs"] mod eval_engineering_bessel_base;
#[path = "eval_engineering_convert_core.rs"] mod eval_engineering_convert_core;
#[path = "eval_engineering_convert_eval.rs"] mod eval_engineering_convert_eval;
#[path = "eval_aggregate_hidden.rs"] mod eval_aggregate_hidden;
#[path = "eval_aggregate_subtotal_engine.rs"] mod eval_aggregate_subtotal_engine;
#[path = "eval_aggregate_subtotal.rs"] mod eval_aggregate_subtotal;
#[path = "eval_aggregate_collection.rs"] mod eval_aggregate_collection;
#[path = "eval_aggregate_basic.rs"] mod eval_aggregate_basic;
#[path = "eval_aggregate_ordered.rs"] mod eval_aggregate_ordered;
#[path = "eval_aggregate.rs"] mod eval_aggregate;
#[path = "eval_math_discrete.rs"] mod eval_math_discrete;
#[path = "eval_math_series.rs"] mod eval_math_series;
#[path = "eval_information_error_type.rs"] mod eval_information_error_type;
#[path = "eval_text_number_format.rs"] mod eval_text_number_format;
#[path = "eval_math_odd.rs"] mod eval_math_odd;
#[path = "eval_array_expand.rs"] mod eval_array_expand;
#[path = "eval_lookup_xmatch.rs"] mod eval_lookup_xmatch;
#[path = "eval_text_split_delimiters.rs"] mod eval_text_split_delimiters;
#[path = "eval_text_optional_arg.rs"] mod eval_text_optional_arg;
#[path = "eval_text_join.rs"] mod eval_text_join;
#[path = "eval_text_split.rs"] mod eval_text_split;
#[path = "eval_text_before_after.rs"] mod eval_text_before_after;
#[path = "eval_lookup_legacy.rs"] mod eval_lookup_legacy;
#[path = "eval_information_formulatext.rs"] mod eval_information_formulatext;
#[path = "eval_text_encodeurl.rs"] mod eval_text_encodeurl;
#[path = "eval_fn_statistics_core.rs"] mod eval_fn_statistics_core;
#[path = "eval_fn_statistics_descriptive.rs"] mod eval_fn_statistics_descriptive;
#[path = "eval_fn_statistics_distribution.rs"] mod eval_fn_statistics_distribution;
#[path = "eval_fn_statistics_legacy_descriptive.rs"] mod eval_fn_statistics_legacy_descriptive;
#[path = "eval_fn_statistics_legacy_distribution.rs"] mod eval_fn_statistics_legacy_distribution;
#[path = "eval_fn_statistics_regression.rs"] mod eval_fn_statistics_regression;
#[path = "eval_fn_text_basic.rs"] mod eval_fn_text_basic;
#[path = "eval_fn_text_bytes.rs"] mod eval_fn_text_bytes;
#[path = "eval_fn_text_conversion.rs"] mod eval_fn_text_conversion;
#[path = "eval_fn_text_east_asian.rs"] mod eval_fn_text_east_asian;
#[path = "eval_fn_text_format.rs"] mod eval_fn_text_format;
#[path = "eval_fn_text_regex.rs"] mod eval_fn_text_regex;
#[path = "eval_fn_text_search.rs"] mod eval_fn_text_search;
#[path = "eval_core_custom_registry.rs"] mod eval_core_custom_registry;
#[path = "eval_core_array_2d.rs"] mod eval_core_array_2d;
#[path = "eval_core_binary.rs"] mod eval_core_binary;
#[path = "eval_core_broadcast.rs"] mod eval_core_broadcast;
#[path = "eval_core_coercion.rs"] mod eval_core_coercion;
#[path = "eval_core_expression.rs"] mod eval_core_expression;
#[path = "eval_core_lambda.rs"] mod eval_core_lambda;
#[path = "eval_core_lambda_scope.rs"] mod eval_core_lambda_scope;
#[path = "eval_core_provider.rs"] mod eval_core_provider;
#[path = "eval_core_runtime_ref_expr.rs"] mod eval_core_runtime_ref_expr;
#[path = "eval_core_runtime_ref_ops.rs"] mod eval_core_runtime_ref_ops;
#[path = "eval_core_runtime_ref_types.rs"] mod eval_core_runtime_ref_types;
#[path = "eval_core_runtime_ref_values.rs"] mod eval_core_runtime_ref_values;
#[path = "eval_core_range_criteria.rs"] mod eval_core_range_criteria;
#[path = "eval_core_range_iteration.rs"] mod eval_core_range_iteration;
#[path = "eval_core_database.rs"] mod eval_core_database;
#[path = "eval_core_dispatch.rs"] mod eval_core_dispatch;
#[path = "eval_core_indirect.rs"] mod eval_core_indirect;
#[path = "eval_core_date_arithmetic.rs"] mod eval_core_date_arithmetic;
#[path = "eval_core_numbers.rs"] mod eval_core_numbers;
#[path = "eval_core_date_serial.rs"] mod eval_core_date_serial;
#[path = "eval_core_criteria.rs"] mod eval_core_criteria;
#[path = "eval_core_value_helpers.rs"] mod eval_core_value_helpers;
#[path = "eval_builtin_names.rs"] mod eval_builtin_names;
#[path = "eval_builtin_names_a_h.rs"] mod eval_builtin_names_a_h;
#[path = "eval_builtin_names_i_r.rs"] mod eval_builtin_names_i_r;
#[path = "eval_builtin_names_s_z.rs"] mod eval_builtin_names_s_z;
