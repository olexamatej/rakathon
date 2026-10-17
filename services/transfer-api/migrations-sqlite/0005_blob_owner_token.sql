-- Bind patient checks and writes to one upload, not a reusable four-digit PIN.
ALTER TABLE blob_transfers ADD COLUMN owner_token TEXT;
ALTER TABLE blob_transfers ADD COLUMN expires_at INTEGER;
UPDATE blob_transfers SET expires_at = created_at + 1209600;
