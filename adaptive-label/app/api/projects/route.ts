import { listProjects } from "@/lib/db";

/**
 * GET /api/projects (design.md → API surface; Requirement 7.4).
 *
 * Lists the seeded demo projects (bachata + sign language) for the dashboard.
 * Read-only over the typed query layer; no AI, media, or embedding work happens
 * here (Requirement 8.4). The dashboard page reads the same data directly as a
 * Server Component, but this route exposes it for client-side/programmatic use
 * and completes the Tier-1 API surface.
 *
 * Outcomes:
 * - success: 200 `{ projects: [{ id, name, domain, status, createdAt }] }`,
 *   ordered by creation time (seed order).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return Response.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      status: p.status,
      createdAt: p.created_at,
    })),
  });
}
