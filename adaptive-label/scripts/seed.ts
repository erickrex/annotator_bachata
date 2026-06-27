/**
 * AdaptiveLabel — offline seed pipeline (Task 6.2).
 *
 * Reads the IP-clean `seed/*.json` dataset (Task 6.1), builds each clip's
 * deterministic `search_text`, computes embeddings **once** with the AI SDK's
 * `embedMany`, and writes the demo data into Aurora:
 *   projects → activated label_schemas + label_fields (from PRESETS) →
 *   media_assets → clips (with embeddings) → labeling_tasks.
 * After the rows are inserted it builds the HNSW index on `clips.embedding`.
 *
 * This is the ONLY place embeddings are generated (Requirements 5.2, 5.5):
 * no request handler computes an embedding. Every embedding is checked against
 * the configured dimension before insert (Property 5 / Requirement 5.6).
 *
 * Run (requires a live Aurora `DATABASE_URL` and `OPENAI_API_KEY`):
 *   npm run seed            # from the adaptive-label/ app directory
 *
 * Prerequisites: the table migrations (db/000–003) must already be applied.
 * The HNSW index (db/010) is applied by this script after seeding.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

import { getServerEnv } from "@/lib/env";
import {
  createClip,
  createLabelField,
  createLabelSchema,
  createLabelingTask,
  createMediaAsset,
  createProject,
  getNextSchemaVersion,
  query,
  withTransaction,
} from "@/lib/db";
import { PRESETS } from "@/lib/schemas/workspace";
import { buildSearchText } from "@/lib/seed/search-text";
import { assignEmbeddings } from "@/lib/seed/embeddings";
import type {
  SeedClip,
  SeedClipDataset,
  SeedManifest,
  SeedProjectEntry,
} from "@/lib/seed/types";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(SCRIPT_DIR, "..", "seed");
const INDEX_SQL_PATH = join(SCRIPT_DIR, "..", "db", "010_clips_embedding_index.sql");

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

/** A clip flattened with its owning project and computed search text. */
interface PreparedClip {
  projectSlug: string;
  clip: SeedClip;
  searchText: string;
}

/**
 * Load the manifest and every per-project clip dataset, returning the manifest
 * plus a flat, deterministically-ordered list of clips (manifest project order,
 * then clip order) with each clip's `search_text` already built.
 */
async function loadDataset(): Promise<{
  manifest: SeedManifest;
  datasets: Map<string, SeedClipDataset>;
  prepared: PreparedClip[];
}> {
  const manifest = await readJson<SeedManifest>(join(SEED_DIR, "projects.json"));
  const datasets = new Map<string, SeedClipDataset>();
  const prepared: PreparedClip[] = [];

  for (const project of manifest.projects) {
    const dataset = await readJson<SeedClipDataset>(
      join(SEED_DIR, project.clipsFile),
    );
    datasets.set(project.slug, dataset);

    for (const clip of dataset.clips) {
      prepared.push({
        projectSlug: project.slug,
        clip,
        searchText: buildSearchText({
          title: clip.title,
          domain: clip.domain,
          searchAttributes: clip.searchAttributes,
        }),
      });
    }
  }

  return { manifest, datasets, prepared };
}

/**
 * Insert one project: the project row, its activated schema version + fields
 * (from PRESETS), media assets, clips (with embeddings), and labeling tasks.
 */
async function seedProject(
  project: SeedProjectEntry,
  dataset: SeedClipDataset,
  embeddingByClipIndex: Map<number, number[]>,
): Promise<{ clips: number; tasks: number }> {
  const preset = PRESETS[project.presetKey];

  const projectRow = await createProject({
    name: project.name,
    domain: project.domain,
  });

  // Activate an immutable schema version + its fields atomically (Req 1.7).
  const version = await getNextSchemaVersion(projectRow.id);
  const schemaRow = await withTransaction(async (client) => {
    const schema = await createLabelSchema(
      {
        projectId: projectRow.id,
        version,
        name: preset.workspaceName,
        timelineMode: preset.timelineMode,
        status: "active",
        generationPrompt: null,
        activatedAt: new Date(),
      },
      client,
    );

    await Promise.all(
      preset.fields.map((field, index) =>
        createLabelField(
          {
            schemaId: schema.id,
            key: field.key,
            label: field.label,
            help: field.help,
            fieldType: field.type,
            required: field.required,
            options: field.options ?? [],
            min: field.min,
            max: field.max,
            group: field.group,
            orderIndex: index,
          },
          client,
        ),
      ),
    );

    return schema;
  });

  // Media assets: map each dataset asset key to its inserted row id.
  const mediaIdByKey = new Map<string, string>();
  for (const asset of dataset.mediaAssets) {
    const row = await createMediaAsset({
      projectId: projectRow.id,
      filename: asset.filename,
      storageKey: asset.storageKey,
      durationSeconds: asset.durationSeconds,
      fps: asset.fps,
      width: asset.width,
      height: asset.height,
      metadata: asset.metadata,
    });
    mediaIdByKey.set(asset.key, row.id);
  }

  // Clips (with embeddings + search_text) and a queued labeling task each.
  let clipCount = 0;
  let taskCount = 0;
  for (const clip of dataset.clips) {
    const embedding = embeddingByClipIndex.get(clip.clipIndex);
    if (!embedding) {
      throw new Error(
        `Missing embedding for ${project.slug} clip #${clip.clipIndex}`,
      );
    }

    const clipRow = await createClip({
      projectId: projectRow.id,
      mediaAssetId: mediaIdByKey.get(clip.mediaAssetKey) ?? null,
      clipIndex: clip.clipIndex,
      title: clip.title,
      domain: clip.domain,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
      metadata: clip.metadata as unknown as Record<string, unknown>,
      searchText: buildSearchText({
        title: clip.title,
        domain: clip.domain,
        searchAttributes: clip.searchAttributes,
      }),
      embedding,
    });
    clipCount += 1;

    await createLabelingTask({
      projectId: projectRow.id,
      clipId: clipRow.id,
      schemaId: schemaRow.id,
      status: "queued",
    });
    taskCount += 1;
  }

  return { clips: clipCount, tasks: taskCount };
}

/** Build the HNSW index on clips.embedding after the rows exist (Req 5.6). */
async function buildEmbeddingIndex(): Promise<void> {
  const sql = await readFile(INDEX_SQL_PATH, "utf8");
  await query(sql);
}

export async function seed(): Promise<void> {
  const env = getServerEnv();
  const { manifest, datasets, prepared } = await loadDataset();

  console.log(
    `Seeding ${manifest.projects.length} projects, ${prepared.length} clips.`,
  );

  // Compute embeddings ONCE across every clip's search_text (Requirement 5.2).
  const { embeddings } = await embedMany({
    model: openai.embedding(env.AI_EMBEDDING_MODEL),
    values: prepared.map((p) => p.searchText),
    providerOptions: {
      openai: { dimensions: env.AI_EMBEDDING_DIMENSIONS },
    },
  });

  // Enforce the configured dimension on every vector before any insert.
  const embedded = assignEmbeddings(
    prepared,
    embeddings,
    env.AI_EMBEDDING_DIMENSIONS,
  );

  // Index embeddings by (projectSlug, clipIndex) for the insertion pass.
  const embeddingByProject = new Map<string, Map<number, number[]>>();
  for (const item of embedded) {
    let perProject = embeddingByProject.get(item.projectSlug);
    if (!perProject) {
      perProject = new Map<number, number[]>();
      embeddingByProject.set(item.projectSlug, perProject);
    }
    perProject.set(item.clip.clipIndex, item.embedding);
  }

  let totalClips = 0;
  let totalTasks = 0;
  for (const project of manifest.projects) {
    const dataset = datasets.get(project.slug);
    if (!dataset) {
      throw new Error(`Missing dataset for project ${project.slug}`);
    }
    const perProject = embeddingByProject.get(project.slug) ?? new Map();
    const result = await seedProject(project, dataset, perProject);
    totalClips += result.clips;
    totalTasks += result.tasks;
    console.log(
      `  ${project.slug}: ${result.clips} clips, ${result.tasks} tasks`,
    );
  }

  console.log("Building HNSW index on clips.embedding ...");
  await buildEmbeddingIndex();

  console.log(
    `Seed complete: ${totalClips} clips, ${totalTasks} tasks across ${manifest.projects.length} projects.`,
  );
}

// Only run when executed directly (e.g. `npm run seed`), not when imported by
// tests — importing this module must never open a DB connection or call the
// embedding API.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  seed()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}
