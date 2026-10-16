use std::net::IpAddr;

use chrono::Utc;
use sqlx::{FromRow, SqlitePool};

use crate::{crypto, model::StoredEnvelope};

#[derive(Clone)]
pub struct TransferStore {
    pool: SqlitePool,
}

#[derive(Debug, FromRow)]
pub struct TransferRecord {
    pub id: String,
    pub envelope_format: String,
    pub format_version: i64,
    pub algorithm: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub expires_at: i64,
}

impl TransferStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn ready(&self) -> Result<(), sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT 1")
            .fetch_one(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn allow_source(
        &self,
        pepper: &[u8],
        purpose: &[u8],
        source: IpAddr,
        limit: i64,
        now: i64,
    ) -> Result<bool, sqlx::Error> {
        let period = now / 60;
        let bucket_input = format!("{source}:{period}");
        let bucket = crypto::digest(pepper, purpose, bucket_input.as_bytes());
        self.consume_bucket(&bucket, now + 120, limit).await
    }

    pub async fn allow_code_attempt(
        &self,
        pepper: &[u8],
        code_digest: &[u8; 32],
        limit: i64,
        now: i64,
    ) -> Result<bool, sqlx::Error> {
        let period = now / 60;
        let mut bucket_input = Vec::with_capacity(40);
        bucket_input.extend_from_slice(code_digest);
        bucket_input.extend_from_slice(&period.to_be_bytes());
        let bucket = crypto::digest(pepper, b"rate:code:v1", &bucket_input);
        self.consume_bucket(&bucket, now + 120, limit).await
    }

    async fn consume_bucket(
        &self,
        bucket: &[u8; 32],
        expires_at: i64,
        limit: i64,
    ) -> Result<bool, sqlx::Error> {
        let hits: i64 = sqlx::query_scalar(
            "INSERT INTO rate_limit_buckets (bucket_key, expires_at, hit_count) \
             VALUES (?, ?, 1) \
             ON CONFLICT(bucket_key) DO UPDATE SET hit_count = hit_count + 1 \
             RETURNING hit_count",
        )
        .bind(bucket.as_slice())
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await?;
        Ok(hits <= limit)
    }

    pub async fn create(
        &self,
        id: &str,
        retrieval_code_digest: &[u8; 32],
        revocation_token_digest: &[u8; 32],
        envelope: StoredEnvelope,
        now: i64,
        expires_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO transfers \
             (id, retrieval_code_digest, revocation_token_digest, envelope_format, \
              format_version, algorithm, nonce, ciphertext, created_at, expires_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(retrieval_code_digest.as_slice())
        .bind(revocation_token_digest.as_slice())
        .bind(envelope.format)
        .bind(envelope.format_version)
        .bind(envelope.algorithm)
        .bind(envelope.nonce)
        .bind(envelope.ciphertext)
        .bind(now)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn redeem(
        &self,
        code_digest: &[u8; 32],
        idempotency_digest: &[u8; 32],
        now: i64,
    ) -> Result<Option<TransferRecord>, sqlx::Error> {
        // A single conditional UPDATE both consumes the code and permits only
        // retries carrying the original idempotency key.
        sqlx::query_as::<_, TransferRecord>(
            "UPDATE transfers \
             SET redeemed_at = COALESCE(redeemed_at, ?), \
                 redemption_key_digest = COALESCE(redemption_key_digest, ?) \
             WHERE retrieval_code_digest = ? AND expires_at > ? \
               AND revoked_at IS NULL \
               AND (redemption_key_digest IS NULL OR redemption_key_digest = ?) \
             RETURNING id, envelope_format, format_version, algorithm, nonce, ciphertext, expires_at",
        )
        .bind(now)
        .bind(idempotency_digest.as_slice())
        .bind(code_digest.as_slice())
        .bind(now)
        .bind(idempotency_digest.as_slice())
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn revoke(
        &self,
        id: &str,
        revocation_digest: &[u8; 32],
        now: i64,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE transfers SET revoked_at = COALESCE(revoked_at, ?) \
             WHERE id = ? AND revocation_token_digest = ? AND expires_at > ? \
               AND redeemed_at IS NULL \
             RETURNING id",
        )
        .bind(now)
        .bind(id)
        .bind(revocation_digest.as_slice())
        .bind(now)
        .fetch_optional(&self.pool)
        .await?;
        Ok(result.is_some())
    }

    pub async fn cleanup(&self) -> Result<(), sqlx::Error> {
        let now = Utc::now().timestamp();
        sqlx::query("DELETE FROM transfers WHERE expires_at <= ? OR revoked_at IS NOT NULL")
            .bind(now)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM rate_limit_buckets WHERE expires_at <= ?")
            .bind(now)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
