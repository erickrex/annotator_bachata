# Agent instructions

Policies for AI assistants and contributors working on this repository.

## Do not install globally or with Homebrew

**Do not ever** use Homebrew, system package managers (`apt install`, `yum`, etc.), `npm install -g`, `pip install` outside a `uv`-managed environment, or other **global** installs to satisfy this project’s dependencies or to “fix” missing tools during automation.

- Do not suggest or run `brew install …` for project toolchain or dependencies.
- Do not add Python packages with bare `pip` for this codebase; use `pyproject.toml` and `uv` (see below).
- Node dependencies belong in `package.json` and are installed with **`npm install`** in the repo root only (not `-g`).

If something is missing, document what the developer must install **by their own means** (official installers, OS vendor docs, or their organization’s standard process)—never prescribe Homebrew or global installs as the fix path for agents.

## Python: always `uv`, always `pyproject.toml`

- Run Python and Python tools only through **`uv`**, for example:
  - `uv run python …`
  - `uv run pytest`
  - `uv run yt-dlp …`
- Add, remove, or upgrade **Python** dependencies only in **`pyproject.toml`**, then refresh the lockfile with **`uv lock`** and sync with **`uv sync`** (or instruct the user to run `uv sync`). Do not manage Python deps with ad hoc `pip install` into arbitrary environments for this project.

## Non-Python binaries

`ffmpeg` / `ffprobe` are not declared in `pyproject.toml`; the app still expects them on `PATH` when those features are used. Do not install them via Homebrew in agent workflows; point to official `ffmpeg` distribution or the user’s own policy-compliant install method.

## Surfacing errors to the AI (no copy-paste when possible)

Cursor does **not** automatically send Simple Browser or in-page UI text to the model. To give the agent **immediate, accurate** error text without retyping:

1. **Run the dev server in Cursor’s integrated terminal** (`npm run dev`). Astro/API failures and subprocess stderr are usually printed there. In chat, **@-mention that terminal** (e.g. `@Terminal`) so the last output is included in context.
2. **Prefer server logs over the browser** for backend failures: the same message the UI shows often originates from the terminal stack trace or stderr.
3. **Problems panel** — For TypeScript/build issues, open **View → Problems** and @-mention the file or paste from the panel if needed.

There is no supported “live push” of arbitrary browser-only errors into the agent without one of: terminal output, @-file, @-terminal, or pasting. Hooks or custom logging to a repo file are possible but not configured here by default.
