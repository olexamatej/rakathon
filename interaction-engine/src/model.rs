use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

// An internal inference contract, deliberately smaller than the HTTP response.
// The server owns references, IDs, timestamps, and coverage arithmetic.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelResult {
    pub evaluation_complete: bool,
    pub resolutions: Vec<ModelResolution>,
    pub interactions: Vec<ModelInteraction>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelResolution {
    pub input_index: usize,
    pub status: ResolutionStatus,
    pub canonical_name: Option<String>,
    pub active_ingredients: Vec<String>,
    pub message: Option<String>,
    pub candidates: Vec<String>,
}

#[derive(Debug, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ResolutionStatus {
    Resolved,
    Unrecognized,
    Ambiguous,
    Unsupported,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelInteraction {
    pub drug_indices: Vec<usize>,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Finding {
    pub summary: String,
    pub severity: Severity,
    pub mechanism: Option<String>,
    pub clinical_effects: Vec<String>,
    pub recommendations: Vec<Recommendation>,
    pub evidence_level: EvidenceLevel,
}

#[derive(
    Debug, Clone, Copy, Deserialize, Serialize, JsonSchema, PartialEq, Eq, PartialOrd, Ord,
)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Unknown,
    Minor,
    Moderate,
    Major,
    Contraindicated,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Recommendation {
    pub action: Action,
    pub description: String,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    AvoidCombination,
    UseAlternative,
    Monitor,
    AdjustDose,
    SeparateAdministration,
    NoAction,
    ConsultClinician,
    Other,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceLevel {
    Established,
    Limited,
    Theoretical,
    Unknown,
}

pub fn output_schema() -> Value {
    let mut schema = serde_json::to_value(schemars::schema_for!(ModelResult)).unwrap();
    strict_objects(&mut schema);
    schema
}

// Structured Outputs requires all object fields to be required; optional Rust
// fields remain nullable. Schemas are generated from the deserialization types.
pub(crate) fn strict_objects(schema: &mut Value) {
    match schema {
        Value::Object(object) => {
            if object.get("type").and_then(Value::as_str) == Some("object") {
                let names: Vec<Value> = object
                    .get("properties")
                    .and_then(Value::as_object)
                    .map(|p| p.keys().cloned().map(Value::String).collect())
                    .unwrap_or_default();
                object.insert("required".into(), Value::Array(names));
                object.insert("additionalProperties".into(), Value::Bool(false));
            }
            for value in object.values_mut() {
                strict_objects(value);
            }
        }
        Value::Array(array) => {
            for value in array {
                strict_objects(value);
            }
        }
        _ => {}
    }
}
