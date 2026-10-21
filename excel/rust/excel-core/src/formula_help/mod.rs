//! Read-only help belongs to the compiled evaluator catalog. Missing definitions fail
//! loudly during discovery; reserved names never become availability promises.
mod limitations;
mod parameters;

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct FormulaParameter {
    pub name: &'static str,
    pub description: &'static str,
    pub description_zh: &'static str,
    pub optional: bool,
    pub repeats: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct FormulaRepeatGroup {
    pub start: usize,
    pub length: usize,
    pub min_groups: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct FormulaLimitation {
    pub en: &'static str,
    pub zh: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct BuiltinFunctionHelp {
    pub summary: &'static str,
    pub summary_zh: &'static str,
    pub args: Vec<FormulaParameter>,
    pub repeat: Option<FormulaRepeatGroup>,
    pub examples: Vec<String>,
    pub limitations: Vec<FormulaLimitation>,
}

// TSV columns: aliases, prototype parameters (? optional, * repeated group),
// English meaning, Chinese meaning, example argument expression. The example
// function name is substituted per alias, preserving the real alias signature.
const DEFINITIONS: &[&str] = &[
    include_str!("math.tsv"), include_str!("logical.tsv"), include_str!("text.tsv"),
    include_str!("reference.tsv"), include_str!("arrays.tsv"), include_str!("date.tsv"),
    include_str!("statistics.tsv"), include_str!("distributions.tsv"),
    include_str!("financial.tsv"), include_str!("engineering.tsv"),
];

pub(super) fn function_help(name: &str) -> BuiltinFunctionHelp {
    let fields = DEFINITIONS.iter().flat_map(|text| text.lines())
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| line.split('\t').collect::<Vec<_>>())
        .find(|fields| fields[0].split('|').any(|alias| alias == name))
        .unwrap_or_else(|| panic!("Missing evaluator parameter help for {name}"));
    assert_eq!(fields.len(), 5, "Invalid help definition for {name}");
    let args: Vec<_> = fields[1].split(',').filter(|token| !token.is_empty()).map(|token| {
        let parameter = token.trim_end_matches(['?', '*']);
        let (description, description_zh) = parameters::describe(name, parameter);
        FormulaParameter { name: parameter, description, description_zh,
            optional: token.contains('?'), repeats: token.contains('*') }
    }).collect();
    let repeat = args.iter().position(|arg| arg.repeats).map(|start| {
        let length = args[start..].iter().take_while(|arg| arg.repeats).count();
        assert!(args[start + length..].iter().all(|arg| !arg.repeats));
        FormulaRepeatGroup { start, length, min_groups: usize::from(!args[start].optional) }
    });
    BuiltinFunctionHelp { summary: fields[2], summary_zh: fields[3], args, repeat,
        examples: vec![if fields[4].starts_with('=') { fields[4].to_owned() }
            else { format!("={name}({})", fields[4]) }],
        limitations: limitations::for_function(name) }
}
