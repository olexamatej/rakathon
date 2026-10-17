use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;

pub const PIN_SPACE: usize = 10_000;

pub fn new_pin() -> Result<String, rand::Error> {
    let mut pin = String::with_capacity(4);
    loop {
        let mut random = [0_u8; 4];
        OsRng.try_fill_bytes(&mut random)?;
        for byte in random {
            // Rejection sampling avoids modulo bias; leading zeros are significant.
            if byte < 250 {
                pin.push((b'0' + byte % 10) as char);
                if pin.len() == 4 {
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
    fn pin_is_four_ascii_digits() {
        for _ in 0..1000 {
            let pin = new_pin().unwrap();
            assert_eq!(pin.len(), 4);
            assert!(valid_pin(&pin));
        }
    }

    #[test]
    fn pin_validation_preserves_zeros_and_rejects_old_or_malformed_codes() {
        for pin in ["0000", "0042", "1234", "9999"] { assert!(valid_pin(pin)); }
        for pin in ["123", "12345", "ABC234", "123456", "12a4", "１２３４", " 1234", "1234\n"] {
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
    code.len() == 4 && code.bytes().all(|byte| byte.is_ascii_digit())
}
