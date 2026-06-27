-- AdaptiveLabel — database extensions
--
-- Run this ONCE against the Aurora PostgreSQL database after it is created and
-- before the table migrations (Task 3) and seed (Task 6). Requires a role with
-- privileges to create extensions (the master/owner role).
--
-- pgvector backs cross-domain "find similar clips" retrieval (Requirements 5.1,
-- 5.6). gen_random_uuid() is provided by pgcrypto and is used by every table's
-- primary key default in the data model.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- Sanity check: confirm the vector extension is installed.
-- select extname, extversion from pg_extension where extname = 'vector';
