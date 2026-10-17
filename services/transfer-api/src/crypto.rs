use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;

const CODE_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GENERATED_PIN_ALPHABET: &[u8; 30] = b"23456789ABCDEFGHJKMNPQRSTVWXYZ";

pub fn new_pin() -> Result<String, rand::Error> {
    let mut pin = String::with_capacity(6);
    loop {
        let mut random = [0_u8; 6];
        OsRng.try_fill_bytes(&mut random)?;
        for byte in random {
            // Reject the two unused indices to keep all 30 characters equally likely.
            if let Some(&character) = GENERATED_PIN_ALPHABET.get((byte & 0b1_1111) as usize) {
                pin.push(character as char);
                if pin.len() == 6 {
                    return Ok(pin);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_is_six_alphanumeric_characters() {
        for _ in 0..100 {
            let pin = new_pin().unwrap();
            assert_eq!(pin.len(), 6);
            assert!(pin.bytes().all(|byte| GENERATED_PIN_ALPHABET.contains(&byte)));
            assert!(pin.bytes().all(|byte| !b"01ILO".contains(&byte)));
            assert!(valid_pin(&pin));
        }
    }

    #[test]
    fn previously_issued_pins_with_zero_and_one_remain_valid() {
        assert!(valid_pin("01ABCD"));
        assert!(valid_pin("10XYZA"));
        for pin in ["IOABCD", "LOABCD", "abcdef", "ABC23", "ABC2345"] {
            assert!(!valid_pin(pin));
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
