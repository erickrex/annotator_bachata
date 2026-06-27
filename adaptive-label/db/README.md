# Database migrations (Task 3)

Plain, ordered SQL migrations for the AdaptiveLabel Aurora PostgreSQL backend.
They map directly to the `Data Models` section of `design.md`. There is no ORM:
the app talks to these tables through the typed query layer in
[`lib/db`](../lib/db).

## Files & order

Apply in ascending numeric order. The HNSW index is split out on purpose — it is
built **after** the offline seed (Task 6), not with the table migrations.

| File                          | When            | Contents                                                                 |
| ----------------------------- | --------------- | ------------------------------------------------------------------------ |
| `000_extensions.sql`          | once, first     | `vector` + `pgcrypto` extensions                                         |
| `001_core_tables.sql`         | schema setup    | `projects`, `label_schemas`, `label_fields`, `media_assets`, `clips`     |
| `002_workflow_tables.sql`     | schema setup    | `labeling_tasks`, `annotations`                                          |
| `003_review_audit_export.sql` | schema setup    | `annotation_reviews`, `audit_events`, `exports`                          |
| `010_clips_embedding_index.sql` | **after seed** | HNSW index on `clips.embedding` (`vector_cosine_ops`)                  |

Every object uses `if not exists`, so the files are idempotent and safe to
re-apply.

## Running the migrations

These require network access to the Aurora endpoint and a Postgres client. Per
`AGENTS.md`, install any client (e.g. `psql`) by your own policy-compliant means
— do not use Homebrew/global installs in agent workflows.

```bash
# from the adaptive-label/ app directory
DB="postgres://USER:PASSWORD@HOST:5432/adaptive_label?sslmode=require"

# 1. extensions (once)
psql "$DB" -f db/000_extensions.sql

# 2. tables (schema setup)
psql "$DB" -f db/001_core_tables.sql
psql "$DB" -f db/002_workflow_tables.sql
psql "$DB" -f db/003_review_audit_export.sql

# 3. seed the data (Task 6) ... then:
psql "$DB" -f db/010_clips_embedding_index.sql
```

> The `010_clips_embedding_index.sql` step is invoked by the seed pipeline
> (Task 6) after rows are inserted. Running it against an empty `clips` table is
> harmless but pointless — build it once the embeddings exist.

## Verifying

```sql
-- tables present
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

-- vector column + dimension on clips
select atttypmod from pg_attribute
where attrelid = 'clips'::regclass and attname = 'embedding';  -- expect 1536

-- index present (after seed)
select indexname from pg_indexes where tablename = 'clips';
```
