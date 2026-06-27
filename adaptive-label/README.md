# AdaptiveLabel

Next.js (App Router, TypeScript) application for the AdaptiveLabel spec. It
generates schema-driven video-labeling workspaces from a plain-English dataset
description, backed by Aurora PostgreSQL (pgvector) and the Vercel AI SDK.

This app lives in the `adaptive-label/` subdirectory so it does not clobber the
existing Astro app at the repository root. It has its own `package.json` and
lockfile.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 with shadcn-style primitives (`components/ui`, `lib/utils.ts`,
  `components.json`)
- `pg` (pooled Postgres client), `ai` + `@ai-sdk/react` + `@ai-sdk/openai`,
  `zod`
- Runtime media pipeline: `ffprobe`, `ffmpeg`, `uv run python -m analyzer`,
  `uv run yt-dlp`, Remotion Player, and Remotion Renderer
- Vitest + Testing Library for unit/component tests
- Dependency versions are pinned (no `^` ranges)

## Getting started

```bash
npm install          # from this directory
uv sync              # install analyzer deps into the local uv environment
cp .env.example .env.local   # fill in DATABASE_URL, OPENAI_API_KEY, storage
npm run dev          # start the dev server
```

Runtime video analysis requires `ffmpeg`, `ffprobe`, and `uv` on `PATH`.
Agents must not install those globally; use official installers or your
organization's policy-compliant toolchain setup.

## Scripts

- `npm run dev` – start the dev server
- `npm run build` – production build
- `npm run start` – serve the production build
- `npm run lint` – ESLint
- `npm run test` – run Vitest once
- `npm run test:watch` – Vitest in watch mode

## Environment variables

See `.env.example`. Required at runtime (read via `lib/env.ts`):

- `DATABASE_URL` – Aurora PostgreSQL (pooled / serverless-safe) connection string
- `OPENAI_API_KEY` – AI provider key for the Vercel AI SDK
- `AI_EMBEDDING_MODEL` / `AI_EMBEDDING_DIMENSIONS` – embedding model + dimension
  (must match the `clips.embedding vector(N)` column)
- `STORAGE_PUBLIC_BASE_URL` – base URL demo media clips are served from
- `ADAPTIVE_LABEL_MEDIA_DIR` – local filesystem root for uploads, YouTube
  imports, extracted WAVs, and rendered MP4 exports. Defaults to `.media`.
- `MEDIA_PROCESSING_MODE` – v1 supports `in_process`; this is intended for a
  self-hosted Next.js server process, not Vercel serverless.

`ffmpeg` and `ffprobe` are external runtime binaries and are intentionally not
declared in `package.json` or `pyproject.toml`.

> Note: This project uses Next.js 16, which has breaking changes relative to
> earlier versions. See `AGENTS.md` and the docs under `node_modules/next/dist/docs/`.

## Deployment & data backbone

- `lib/db/index.ts` — serverless-safe pooled `pg` client (`getPool`, `query`,
  `ping`).
- `app/api/health` — `GET /api/health` runs a trivial `SELECT 1` against Aurora
  and returns `{ status: "ok", db: "up", latencyMs }` (or a `503` on failure).
- `db/000_extensions.sql` — enables the `vector` (pgvector) extension.
- `docs/DEPLOYMENT.md` — step-by-step Aurora provisioning, Vercel project setup,
  env wiring, and how to verify the live connection on the deployed URL.

Quick local check (requires a reachable `DATABASE_URL`):

```bash
npm run dev
curl -s http://localhost:3000/api/health
```
