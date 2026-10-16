-- Widen the limit without changing applied migration checksums or losing blobs.
CREATE TABLE blob_transfers_1mib (
    pin_digest BLOB PRIMARY KEY NOT NULL CHECK (length(pin_digest) = 32),
    payload BLOB NOT NULL CHECK (length(payload) <= 1048576),
    created_at INTEGER NOT NULL
);

INSERT INTO blob_transfers_1mib (pin_digest, payload, created_at)
SELECT pin_digest, payload, created_at FROM blob_transfers;

DROP TABLE blob_transfers;
ALTER TABLE blob_transfers_1mib RENAME TO blob_transfers;
