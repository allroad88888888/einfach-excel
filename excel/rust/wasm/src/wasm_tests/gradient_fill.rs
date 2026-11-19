#[test]
fn gradient_wire_keeps_all_stops_and_path_coordinates_through_sparse_and_full_formats() {
    use serde_json::json;
    let stops = json!([{"position":0.9,"color":"#123456"},{"position":0.1,"color":"#abcdef"},
        {"position":0.1,"color":"#fedcba"}]);
    for fill in [json!({"kind":"linear-gradient","degree":-450.0,"stops":stops}),
        json!({"kind":"path-gradient","left":0.9,"right":0.1,"top":0.5,"bottom":0.5,"stops":stops})] {
        let wire: CellFormatJSON = serde_json::from_value(json!({"fill":fill})).unwrap();
        assert_eq!(serde_json::to_value(CellFormatJSON::from_style(&wire.clone().into_style())).unwrap()["fill"], fill);
        assert_eq!(serde_json::to_value(CellFormatJSON::from_format(&wire.into_format())).unwrap()["fill"], fill);
    }
    for fill in [json!({"kind":"path-gradient","left":0,"right":2,"top":0,"bottom":1,"stops":stops}),
        json!({"kind":"linear-gradient","degree":null,"stops":stops})] {
        assert!(serde_json::from_value::<CellFormatJSON>(json!({"fill":fill})).is_err());
    }
}
