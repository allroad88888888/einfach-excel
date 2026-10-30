//! 开发用：`cargo run --example native2xlsx -- in.einfach.json out.xlsx`
fn main() {
    let mut args = std::env::args().skip(1);
    let (input, output) = (args.next().expect("input"), args.next().expect("output"));
    let text = std::fs::read_to_string(&input).expect("readable file");
    match einfach_xlsx::native_to_xlsx(&text) {
        Ok(bytes) => std::fs::write(output, bytes).expect("writable output"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
