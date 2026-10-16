use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;

const CODE_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

pub fn new_retrieval_code() -> Result<String, rand::Error> {
    let mut random = [0_u8; 12];
    let mut rng = OsRng;
    rng.try_fill_bytes(&mut random)?;
    Ok(random
        .iter()
        .map(|byte| CODE_ALPHABET[(byte & 0b1_1111) as usize] as char)
        .collect())
}

pub fn new_pin() -> Result<String, rand::Error> {
    let mut random = [0_u8; 6];
    OsRng.try_fill_bytes(&mut random)?;
    Ok(random
        .iter()
        .map(|byte| CODE_ALPHABET[(byte & 0b1_1111) as usize] as char)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_is_six_alphanumeric_characters() {
        for _ in 0..100 {
            let pin = new_pin().unwrap();
            assert_eq!(pin.len(), 6);
            assert!(pin.bytes().all(|byte| CODE_ALPHABET.contains(&byte)));
        }
    }
}

pub fn new_revocation_token() -> Result<String, rand::Error> {
    let mut random = [0_u8; 32];
    let mut rng = OsRng;
    rng.try_fill_bytes(&mut random)?;
    Ok(URL_SAFE_NO_PAD.encode(random))
}

pub fn digest(pepper: &[u8], purpose: &[u8], value: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper)
        .expect("HMAC-SHA-256 accepts keys of any length");
    mac.update(purpose);
    mac.update(b"\0");
    mac.update(value);
    mac.finalize().into_bytes().into()
}

pub fn valid_retrieval_code(code: &str) -> bool {
    code.len() == 12
        && code
            .bytes()
            .all(|byte| CODE_ALPHABET.contains(&byte))
}
