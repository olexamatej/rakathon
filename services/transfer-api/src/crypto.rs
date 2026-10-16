use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;

const CODE_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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

pub fn digest(pepper: &[u8], purpose: &[u8], value: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper)
        .expect("HMAC-SHA-256 accepts keys of any length");
    mac.update(purpose);
    mac.update(b"\0");
    mac.update(value);
    mac.finalize().into_bytes().into()
}

pub fn verify_digest(pepper: &[u8], purpose: &[u8], value: &[u8], expected: &[u8; 32]) -> bool {
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper)
        .expect("HMAC-SHA-256 accepts keys of any length");
    mac.update(purpose);
    mac.update(b"\0");
    mac.update(value);
    mac.verify_slice(expected).is_ok()
}

pub fn valid_pin(code: &str) -> bool {
    code.len() == 6
        && code
            .bytes()
            .all(|byte| CODE_ALPHABET.contains(&byte))
}
