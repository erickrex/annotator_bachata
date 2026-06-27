# Deployment & Data Backbone (Task 2)

This document covers provisioning Aurora PostgreSQL, wiring Vercel, and verifying
the live connection via `/api/health`. It implements **Requirements 7.1, 7.2,
7.3, and 5.1**.

> **What this repo already provides (done in code):**
>
> - `lib/db/index.ts` — a serverless-safe **pooled** `pg` client (singleton
>   `Pool` on `globalThis`, TLS enabled for Aurora) with a `ping()` helper.
> - `app/api/health/route.ts` — a non-cached `GET /api/health` that runs a
>   trivial `SELECT 1` and returns `{ status: "ok", db: "up", latencyMs }` on
>   success or a `503` with diagnostics on failure.
> - `db/000_extensions.sql` — `create extension if not exists vector;` (+
>   `pgcrypto`).
> - `.env.example` — the env vars the deployment needs.
>
> **What you (the developer) must run yourself** (needs AWS + Vercel
> credentials and network access): the steps below. Per `AGENTS.md`, do not use
> Homebrew or global installs — use the official AWS/Vercel consoles or CLIs
> installed by your own policy-compliant means.

---

## 1. Provision Aurora PostgreSQL + enable `vector`

You can use the AWS Console or the AWS CLI. The key requirements:

- **Engine:** Aurora PostgreSQL (a recent major version that supports `pgvector`,
  i.e. PostgreSQL 15/16-compatible Aurora).
- **Serverless-safe connections:** enable **RDS Proxy** (recommended) or an
  Aurora connection pooler so serverless functions don't exhaust connections
  (Requirement 7.3). Point `DATABASE_URL` at the **proxy/pooler endpoint**, not
  the raw cluster writer, when possible.
- **TLS:** Aurora requires SSL. Keep `sslmode=require` in the connection string
  (the pooled client accepts the managed cert; use `verify-full` with a bundled
  CA if your policy requires full verification).

### Console (high level)

1. RDS → **Create database** → **Amazon Aurora** → **Aurora PostgreSQL**.
2. Choose a version that supports pgvector; set credentials and a DB name
   (e.g. `adaptive_label`).
3. Networking: make it reachable from Vercel (publicly accessible with a
   restrictive security group, **or** via your VPC/peering setup). Restrict the
   security group to the source you'll connect from.
4. (Recommended) Create an **RDS Proxy** for the cluster for connection pooling.
5. After the cluster is **Available**, capture the endpoint, port (5432), user,
   password, and DB name.

### CLI (illustrative — adjust IDs/subnets/SG to your account)

```bash
# 1) Cluster
aws rds create-db-cluster \
  --db-cluster-identifier adaptive-label \
  --engine aurora-postgresql \
  --engine-version 16.4 \
  --master-username adaptive \
  --master-user-password '<STRONG_PASSWORD>' \
  --database-name adaptive_label \
  --vpc-security-group-ids sg-XXXXXXXX \
  --db-subnet-group-name <your-subnet-group>

# 2) Writer instance
aws rds create-db-instance \
  --db-instance-identifier adaptive-label-1 \
  --db-cluster-identifier adaptive-label \
  --engine aurora-postgresql \
  --db-instance-class db.serverless   # or a provisioned class

# 3) Wait until available, then read the endpoint
aws rds describe-db-clusters \
  --db-cluster-identifier adaptive-label \
  --query 'DBClusters[0].Endpoint' --output text
```

### Enable the `vector` extension

Once you can reach the database, run the bundled SQL (Requirement 5.1). Use any
Postgres client you already have (`psql`, a GUI, or a query editor):

```bash
psql "postgres://USER:PASSWORD@HOST:5432/adaptive_label?sslmode=require" \
  -f db/000_extensions.sql
```

Verify:

```sql
select extname, extversion from pg_extension where extname = 'vector';
```

> The table migrations and the HNSW index on `clips.embedding` are created in
> **Task 3** / **Task 6** respectively; this task only needs the cluster up and
> the `vector` extension enabled.

---

## 2. Create the Vercel project + wire env vars

1. Push this repo to your Git provider.
2. In Vercel → **Add New… → Project** → import the repo.
3. **Root Directory:** set it to `adaptive-label` (this app lives in a
   subdirectory of the repo). Framework preset: **Next.js**.
4. **Environment Variables** (Production + Preview) — mirror `.env.example`:

   | Variable                  | Value                                                              |
   | ------------------------- | ------------------------------------------------------------------ |
   | `DATABASE_URL`            | `postgres://USER:PASSWORD@PROXY_OR_CLUSTER_HOST:5432/adaptive_label?sslmode=require` |
   | `OPENAI_API_KEY`          | your AI provider key                                               |
   | `AI_EMBEDDING_MODEL`      | `text-embedding-3-small` (or your chosen model)                    |
   | `AI_EMBEDDING_DIMENSIONS` | `1536` (must match `clips.embedding vector(N)`)                    |
   | `STORAGE_PUBLIC_BASE_URL` | public base URL for demo media                                     |

   Or via the CLI:

   ```bash
   vercel link            # select/create the project, root = adaptive-label
   vercel env add DATABASE_URL production
   vercel env add OPENAI_API_KEY production
   # …repeat for the rest, and for the "preview" environment as needed
   ```

5. **Deploy the empty shell:**

   ```bash
   vercel --prod
   ```

> **Networking note:** if Aurora is not publicly accessible, the Vercel
> functions must reach it through your VPC (e.g. Vercel's secure compute /
> a tunnel / peering). The simplest hackathon path is a publicly accessible
> Aurora endpoint locked down to a tight security group, fronted by RDS Proxy.

---

## 3. Verify the connection in production

After the deploy finishes, hit the health route on the **deployed** URL:

```bash
curl -s https://<your-deployment>.vercel.app/api/health | jq
```

Expected (success):

```json
{ "status": "ok", "db": "up", "latencyMs": 42 }
```

On failure you'll get a `503` with a diagnostic, e.g.:

```json
{ "status": "error", "db": "down", "latencyMs": 5012, "error": "..." }
```

Common fixes for a `down` result:

- `DATABASE_URL` typo or wrong host/port → re-check the proxy/cluster endpoint.
- Security group not allowing the connection → open 5432 to the right source.
- Missing TLS → keep `sslmode=require` in the URL.
- `vector` extension not enabled → re-run `db/000_extensions.sql`.

When `/api/health` returns `ok` on the public URL, Task 2 is complete: Vercel is
live (7.1), it reads from Aurora (7.2) over a pooled connection (7.3), and the
`vector` extension is enabled (5.1). Capture a screenshot of the `ok` response
and the AWS RDS console for the submission proof (see Task 14).
