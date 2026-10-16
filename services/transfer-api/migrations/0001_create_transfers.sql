CREATE TABLE transfers (
    id UUID PRIMARY KEY,
    retrieval_code_digest BYTEA NOT NULL UNIQUE
        CHECK (octet_length(retrieval_code_digest) = 32),
    revocation_token_digest BYTEA NOT NULL
        CHECK (octet_length(revocation_token_digest) = 32),
    redemption_key_digest BYTEA
        CHECK (redemption_key_digest IS NULL OR octet_length(redemption_key_digest) = 32),
    envelope_format TEXT NOT NULL CHECK (envelope_format = 'pillgaze.medication-list'),
    format_version SMALLINT NOT NULL CHECK (format_version = 1),
    algorithm TEXT NOT NULL CHECK (algorithm = 'A256GCM'),
    nonce BYTEA NOT NULL CHECK (octet_length(nonce) = 12),
    ciphertext BYTEA NOT NULL CHECK (octet_length(ciphertext) <= 262144),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at),
    CHECK ((redeemed_at IS NULL) = (redemption_key_digest IS NULL))
);

CREATE INDEX transfers_expiry_idx ON transfers (expires_at);

CREATE TABLE rate_limit_buckets (
    bucket_key BYTEA PRIMARY KEY CHECK (octet_length(bucket_key) = 32),
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count BIGINT NOT NULL CHECK (hit_count > 0)
);

CREATE INDEX rate_limit_expiry_idx ON rate_limit_buckets (expires_at);
