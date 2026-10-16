-- Independent of legacy encrypted transfers and their expiry cleanup.
CREATE TABLE blob_transfers (
    pin_digest BLOB PRIMARY KEY NOT NULL CHECK (length(pin_digest) = 32),
    payload BLOB NOT NULL CHECK (length(payload) <= 393216),
    created_at INTEGER NOT NULL
);
