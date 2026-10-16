use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};

pub const MAX_CIPHERTEXT_BYTES: usize = 262_144;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTransferRequest {
    pub envelope: EncryptedEnvelope,
    pub expires_in_seconds: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RedeemTransferRequest {
    pub retrieval_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncryptedEnvelope {
    pub format: String,
    pub format_version: u16,
    pub algorithm: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Debug)]
pub struct StoredEnvelope {
    pub format: String,
    pub format_version: i64,
    pub algorithm: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransferResponse {
    pub transfer_id: String,
    pub retrieval_code: String,
    pub revocation_token: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedeemTransferResponse {
    pub transfer_id: String,
    pub envelope: EncryptedEnvelope,
    pub expires_at: String,
}

impl EncryptedEnvelope {
    pub fn decode(self) -> Result<StoredEnvelope, ()> {
        if self.format != "pillgaze.medication-list"
            || self.format_version != 1
            || self.algorithm != "A256GCM"
        {
            return Err(());
        }

        let nonce = URL_SAFE_NO_PAD.decode(self.nonce).map_err(|_| ())?;
        let ciphertext = URL_SAFE_NO_PAD.decode(self.ciphertext).map_err(|_| ())?;

        if nonce.len() != 12 || !(16..=MAX_CIPHERTEXT_BYTES).contains(&ciphertext.len()) {
            return Err(());
        }

        Ok(StoredEnvelope {
            format: self.format,
            format_version: i64::from(self.format_version),
            algorithm: self.algorithm,
            nonce,
            ciphertext,
        })
    }

    pub fn from_stored(
        format: String,
        format_version: i64,
        algorithm: String,
        nonce: &[u8],
        ciphertext: &[u8],
    ) -> Self {
        Self {
            format,
            format_version: format_version as u16,
            algorithm,
            nonce: URL_SAFE_NO_PAD.encode(nonce),
            ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        }
    }
}
