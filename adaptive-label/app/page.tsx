import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { listProjects } from "@/lib/db";
import type { ProjectRow } from "@/lib/db/types";

/**
 * `/` — the dashboard (Task 13 / Requirement 3).
 *
 * A Server Component that lists the seeded demo projects (bachata + sign
 * language) from Aurora and links each into its labeling workspace, alongside a
 * "create workspace" CTA into the generation wizard. Reads are stored data only
 * (no AI/media/embedding work here). If the database can't be reached the page
 * still renders with an inline notice rather than crashing, so the deployed
 * shell stays up.
 */
export const dynamic = "force-dynamic";

async function loadProjects(): Promise<{
  projects: ProjectRow[];
  error: string | null;
}> {
  try {
    return { projects: await listProjects(), error: null };
  } catch {
    return {
      projects: [],
      error:
        "Couldn't load projects from the database. Check the connection and seed the demo data.",
    };
  }
}

export default async function Home() {
  const { projects, error } = await loadProjects();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            AdaptiveLabel
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate task-specific video labeling workspaces from a
            plain-English dataset description. Same engine, two domains: bachata
            beat grids and sign-language gloss segments.
          </p>
        </div>
        <Link href="/wizard" className={buttonVariants()}>
          Create workspace
        </Link>
      </header>

      <section aria-label="Demo projects" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projects
        </h2>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        ) : projects.length === 0 ? (
          <p className="rounded-md border border-input p-6 text-sm text-muted-foreground">
            No projects yet. Seed the demo data, or create a workspace from the
            wizard.
          </p>
        ) : (
          <ul
            data-testid="project-list"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-border p-4 transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <span className="text-base font-medium text-foreground">
                    {project.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{project.domain}</span> ·{" "}
                    {project.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
