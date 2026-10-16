CREATE TABLE transfers (
    id TEXT PRIMARY KEY NOT NULL,
    retrieval_code_digest BLOB NOT NULL UNIQUE
        CHECK (length(retrieval_code_digest) = 32),
    revocation_token_digest BLOB NOT NULL
        CHECK (length(revocation_token_digest) = 32),
    redemption_key_digest BLOB
        CHECK (redemption_key_digest IS NULL OR length(redemption_key_digest) = 32),
    envelope_format TEXT NOT NULL CHECK (envelope_format = 'pillgaze.medication-list'),
    format_version INTEGER NOT NULL CHECK (format_version = 1),
    algorithm TEXT NOT NULL CHECK (algorithm = 'A256GCM'),
    nonce BLOB NOT NULL CHECK (length(nonce) = 12),
    ciphertext BLOB NOT NULL CHECK (length(ciphertext) <= 262144),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    redeemed_at INTEGER,
    revoked_at INTEGER,
    CHECK ((redeemed_at IS NULL) = (redemption_key_digest IS NULL))
);

CREATE INDEX transfers_expiry_idx ON transfers (expires_at);

CREATE TABLE rate_limit_buckets (
    bucket_key BLOB PRIMARY KEY NOT NULL CHECK (length(bucket_key) = 32),
    expires_at INTEGER NOT NULL,
    hit_count INTEGER NOT NULL CHECK (hit_count > 0)
);

CREATE INDEX rate_limit_expiry_idx ON rate_limit_buckets (expires_at);
