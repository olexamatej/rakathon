fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(&interaction_engine::model::output_schema()).unwrap()
    );
}
