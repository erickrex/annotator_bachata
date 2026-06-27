-- AdaptiveLabel — clips embedding index (Task 3 / runs in Task 6)
--
-- ⚠️ RUN THIS *AFTER* SEEDING, not with the table migrations.
--
-- The HNSW index on clips.embedding is intentionally created only once the clip
-- rows (and their embeddings) have been inserted by the offline seed pipeline
-- (Task 6). Building HNSW after the data is present is faster and yields a
-- better graph than maintaining it through bulk inserts.
--
-- Implements Requirement 5.6 (back the cosine-distance similarity query with a
-- vector index whose ops class matches the query). The similarity query uses
-- the `<=>` cosine-distance operator, so the index uses `vector_cosine_ops`.
--
-- Idempotent: re-applying is safe.

create index if not exists clips_embedding_idx
  on clips using hnsw (embedding vector_cosine_ops);
