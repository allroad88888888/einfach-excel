#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum ImportValueJSON {
    Number(f64),
    Boolean(bool),
    Text(String),
}

#[derive(Clone, Debug)]
enum BulkImportKindJSON {
    Text(String),
    Invalid,
}

impl Default for BulkImportKindJSON {
    fn default() -> Self {
        BulkImportKindJSON::Invalid
    }
}

impl<'de> Deserialize<'de> for BulkImportKindJSON {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: de::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = BulkImportKindJSON;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a string import kind")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Text(value.to_string()))
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Text(value))
            }

            fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Invalid)
            }

            fn visit_i64<E>(self, _value: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Invalid)
            }

            fn visit_u64<E>(self, _value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Invalid)
            }

            fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Invalid)
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Invalid)
            }

            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportKindJSON::Invalid)
            }

            fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: de::Deserializer<'de>,
            {
                deserializer.deserialize_any(self)
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: de::SeqAccess<'de>,
            {
                while let Some(de::IgnoredAny) = seq.next_element()? {}
                Ok(BulkImportKindJSON::Invalid)
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: de::MapAccess<'de>,
            {
                while let Some((de::IgnoredAny, de::IgnoredAny)) = map.next_entry()? {}
                Ok(BulkImportKindJSON::Invalid)
            }
        }

        deserializer.deserialize_any(Visitor)
    }
}

#[derive(Clone, Debug)]
enum BulkImportValueJSON {
    Number(f64),
    Boolean(bool),
    Text(String),
    Invalid,
}

impl<'de> Deserialize<'de> for BulkImportValueJSON {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: de::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = BulkImportValueJSON;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a primitive import value")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Text(value.to_string()))
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Text(value))
            }

            fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Boolean(value))
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Number(value as f64))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Number(value as f64))
            }

            fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Number(value))
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Invalid)
            }

            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BulkImportValueJSON::Invalid)
            }

            fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: de::Deserializer<'de>,
            {
                deserializer.deserialize_any(self)
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: de::SeqAccess<'de>,
            {
                while let Some(de::IgnoredAny) = seq.next_element()? {}
                Ok(BulkImportValueJSON::Invalid)
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: de::MapAccess<'de>,
            {
                while let Some((de::IgnoredAny, de::IgnoredAny)) = map.next_entry()? {}
                Ok(BulkImportValueJSON::Invalid)
            }
        }

        deserializer.deserialize_any(Visitor)
    }
}
