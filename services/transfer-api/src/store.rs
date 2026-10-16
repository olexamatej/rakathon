use std::net::IpAddr;

use chrono::Utc;
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use crate::crypto;

#[derive(Clone)]
pub struct TransferStore {
    pool: SqlitePool,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobMetadata {
    pub pin_digest: String,
    pub size_bytes: i64,
}

impl TransferStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn ready(&self) -> Result<(), sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT 1").fetch_one(&self.pool).await?;
        Ok(())
    }

    pub async fn list_blobs(&self, offset: u32) -> Result<Vec<BlobMetadata>, sqlx::Error> {
        // Select metadata only; never load payloads into the admin response.
        sqlx::query_as::<_, BlobMetadata>(
            "SELECT hex(pin_digest) AS pin_digest, length(payload) AS size_bytes \
             FROM blob_transfers ORDER BY created_at DESC, rowid DESC LIMIT 101 OFFSET ?",
        )
        .bind(i64::from(offset))
        .fetch_all(&self.pool)
        .await
    }

    pub async fn delete_blob(&self, digest: &[u8; 32]) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM blob_transfers WHERE pin_digest = ?")
            .bind(digest.as_slice())
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() == 1)
    }

    // Payloads are not unique: identical uploads must occupy separate rows.
    // False means a PIN collision. Never overwrite an existing payload.
    pub async fn create_blob(
        &self,
        pin_digest: &[u8; 32],
        payload: &[u8],
        now: i64,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "INSERT INTO blob_transfers (pin_digest, payload, created_at) VALUES (?, ?, ?) \
             ON CONFLICT(pin_digest) DO NOTHING",
        )
        .bind(pin_digest.as_slice())
        .bind(payload)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn get_blob(&self, pin_digest: &[u8; 32]) -> Result<Option<Vec<u8>>, sqlx::Error> {
        sqlx::query_scalar("SELECT payload FROM blob_transfers WHERE pin_digest = ?")
            .bind(pin_digest.as_slice())
            .fetch_optional(&self.pool)
            .await
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
        let hits: i64 = sqlx::query_scalar(
            "INSERT INTO rate_limit_buckets (bucket_key, expires_at, hit_count) \
             VALUES (?, ?, 1) \
             ON CONFLICT(bucket_key) DO UPDATE SET hit_count = hit_count + 1 \
             RETURNING hit_count",
        )
        .bind(bucket.as_slice())
        .bind(now + 120)
        .fetch_one(&self.pool)
        .await?;
        Ok(hits <= limit)
    }

    // Only rate-limit counters expire. Stored blobs and legacy rows are untouched.
    pub async fn cleanup(&self) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM rate_limit_buckets WHERE expires_at <= ?")
            .bind(Utc::now().timestamp())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn blob_preserves_bytes_survives_cleanup_and_cannot_be_overwritten() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:").await.unwrap();
        crate::migrate(&pool).await.unwrap();
        let store = TransferStore::new(pool);
        let digest = [7; 32];
        let payload = b" { \"z\": 1, \"a\": [true, null] } \n";
        assert!(store.create_blob(&digest, payload, 1).await.unwrap());
        assert!(!store.create_blob(&digest, b"{}", 2).await.unwrap());
        store.cleanup().await.unwrap();
        assert_eq!(store.get_blob(&digest).await.unwrap().unwrap(), payload);
        assert_eq!(store.get_blob(&digest).await.unwrap().unwrap(), payload);
        assert!(store.get_blob(&[8; 32]).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn admin_listing_puts_newest_blob_first() {
        let pool = SqlitePoolOptions::new().max_connections(1)
            .connect("sqlite::memory:").await.unwrap();
        crate::migrate(&pool).await.unwrap();
        let store = TransferStore::new(pool);
        store.create_blob(&[1; 32], b"old", 10).await.unwrap();
        store.create_blob(&[2; 32], b"new", 10).await.unwrap();

        let rows = store.list_blobs(0).await.unwrap();
        assert_eq!(rows[0].pin_digest, "02".repeat(32));
        assert_eq!(rows[1].pin_digest, "01".repeat(32));
    }

    #[tokio::test]
    async fn database_enforces_one_mib_limit() {
        let pool = SqlitePoolOptions::new().max_connections(1)
            .connect("sqlite::memory:").await.unwrap();
        crate::migrate(&pool).await.unwrap();
        let store = TransferStore::new(pool);
        assert!(store.create_blob(&[1; 32], &vec![b'x'; 1048576], 1).await.unwrap());
        assert!(store.create_blob(&[2; 32], &vec![b'x'; 1048577], 1).await.is_err());
    }

    #[tokio::test]
    async fn widening_migration_preserves_existing_blob() {
        let pool = SqlitePoolOptions::new().max_connections(1)
            .connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(include_str!("../migrations-sqlite/0001_create_transfers.sql"))
            .execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations-sqlite/0002_create_blob_transfers.sql"))
            .execute(&pool).await.unwrap();
        let store = TransferStore::new(pool.clone());
        assert!(store.create_blob(&[3; 32], b"{\"kept\":true}", 1).await.unwrap());
        sqlx::raw_sql(include_str!("../migrations-sqlite/0003_blob_limit_1mib.sql"))
            .execute(&pool).await.unwrap();
        assert_eq!(store.get_blob(&[3; 32]).await.unwrap().unwrap(), b"{\"kept\":true}");
    }
}
