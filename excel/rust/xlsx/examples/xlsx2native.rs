//! 开发用：`cargo run --example xlsx2native -- in.xlsx > out.einfach.json`
fn main() {
    let path = std::env::args().nth(1).expect("usage: xlsx2native <file.xlsx>");
    let title = std::path::Path::new(&path).file_stem().and_then(|s| s.to_str()).unwrap_or("Workbook");
    match einfach_xlsx::xlsx_to_native(std::fs::read(&path).expect("readable file"), title) {
        Ok(text) => println!("{text}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
