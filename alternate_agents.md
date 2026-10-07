# Agent Guidance

## Recommended: native Windows (avoids the WSL bridge)

This project has **no Linux-specific dependencies** and the repo already lives on
the Windows drive (`c:\CODEX_Projects\Kirmes_Rush`). Running the toolchain in a
native Windows shell (PowerShell/cmd) avoids the WSL↔Windows shell-integration
layer that causes the instability documented below (fake `Exit Code: -1`,
dropped stdout, wedged sessions). See **`docs/windows-dev-setup.md`** for the
one-time migration (install Node 20.19.6 + pnpm on Windows, fresh `pnpm install`,
point the terminal at PowerShell). Prefer this path.

The WSL guidance below still applies while the terminal is configured to use WSL
bash.

## IMPORTANT: Environment & tooling

This project lives on a WSL (Ubuntu-22.04) filesystem, but Kiro runs on Windows. Shell
commands execute inside WSL bash even though the host reports `cmd`/`win32`. Read this
before running any command.

- **Ignore `Exit Code: -1`.** The Windows↔WSL bridge cannot read the real exit status, so
  it always reports `-1` and leaks the bash prompt into output. `-1` does NOT mean failure.
  Judge success by the actual command output or by inspecting artifacts (e.g. `dist/`).

- **Do NOT use `npm`.** In this WSL setup `npm` resolves to the broken Windows install
  (`/mnt/c/Program Files/nodejs/npm`) and crashes. The nvm node ships no npm — only
  `corepack`, `pnpm`, and `yarn`. **Use `pnpm`** for all package operations
  (`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test`).

- **Set PATH first.** `pnpm`/`node` are not on the default PATH used by the bridge. Prefix
  commands with:
  ```bash
  export PATH="/home/rexbox/.nvm/versions/node/v20.19.6/bin:$PATH"
  ```

- **Long-running commands (dev server, watchers) use the background-process tool**, not a
  blocking shell call. Start the dev server with:
  ```bash
  export PATH="/home/rexbox/.nvm/versions/node/v20.19.6/bin:$PATH"; node_modules/.bin/vite --host
  ```
  It serves at http://localhost:3000/ (WSL2 forwards localhost to the Windows browser).

- **Finite verification** (safe to run in a normal shell call): `pnpm build`, `pnpm test`,
  `pnpm run lint`, `pnpm run typecheck`.

## IMPORTANT: The bridge returns BEFORE the command finishes

The single biggest time-sink is treating `Exit Code: -1` as "command done." It is not. For
anything that takes more than a second or two (`pnpm test`, `pnpm build`, `vitest`), the
bridge hands control back almost immediately while the process keeps running in the
background. Reading the log right away shows only the `RUN` header, which looks like a
failure but is just "not finished yet." Follow these rules to avoid the trap:

- **One command, self-contained.** Run the tool AND capture its result in the *same* shell
  invocation, so the summary is only written after the process actually exits. Chain with
  `;` and end with a sentinel you can poll for:
  ```bash
  export PATH="/home/rexbox/.nvm/versions/node/v20.19.6/bin:$PATH"
  node_modules/.bin/vitest run --config vitest.unit.config.js > vitest_raw.log 2>&1
  { grep -aE "Test Files|Tests|Duration" vitest_raw.log | sed 's/\x1b\[[0-9;]*m//g'; echo "===DONE==="; } > VERIFY.txt 2>&1
  ```
  Then poll `VERIFY.txt` — the presence of `===DONE===` proves the run completed. Absence
  means "still running, wait longer," NOT "broken."

- **Never launch a second run to `debug` the first.** Overlapping `vitest`/`pnpm` processes
  write to the same log files concurrently and clobber each other, producing misleading
  partial results (e.g. "only 4 test files ran"). Wait for the first to finish instead.

- **Do not chain a follow-up shell call to inspect a still-running command.** A separate
  "wait then grep" call is unreliable — it can be queued behind or killed with the
  background process, and its output file may never be created. Put the wait/extract in the
  same command (above), or poll the sentinel file with the file-reading tool.

- **Read results via the file-reading tool, not shell stdout.** The bridge frequently drops
  stdout entirely. Redirect to a file (`> log 2>&1`) and read the file. Keep logs
  human-readable — avoid `--reporter=dot` (it emits one giant single line with no parseable
  tail); the default or `--reporter=basic` reporter is fine.

- **`vitest` needs a generous wall-clock budget.** Environment setup alone is ~30-35s; a
  full unit run is ~60-90s. Budget a single ~120s wait, then read the sentinel once.

- **If the terminal stops executing anything** (even `echo`/`pwd` produce no output and
  create no files), the WSL bridge session is wedged — usually from orphaned background
  processes plus stacked blocking `sleep` calls. Recover with `pkill -f vitest` in a real
  WSL terminal and reload the Kiro window ("Developer: Reload Window"). File edits and the
  `delete_file` tool still work while the shell is wedged, because they bypass the bridge.

## IMPORTANT: Recovering a wedged shell bridge (and what does NOT fix it)

When the terminal stops returning output — `echo`/`pwd` produce nothing and create no
files, or a run's sentinel file never appears — the WSL↔Windows shell **bridge session is
wedged**. This is a Kiro ↔ WSL shell-integration problem, NOT a Node, pnpm, or OS-package
problem. It is caused by the single reused shell session backing up: orphaned `vitest`
workers plus stacked blocking `sleep` polls pile up and the bridge stops draining commands.

### How to recover (in order)
1. **`pkill -f vitest`** in a real WSL terminal (not the Kiro bridge) to clear orphaned
   test workers. If a dev server is stuck too, `pkill -f vite`.
2. **"Developer: Reload Window"** — Kiro is built on VS Code; open the Command Palette
   (Ctrl+Shift+P) and run *Developer: Reload Window*. This restarts only the editor window
   (renderer + extension host + terminal/shell integration) — it does NOT reboot WSL or the
   machine. It tears down the stuck terminal and its child processes and starts a fresh
   session.
3. After reload, confirm the bridge is alive by redirecting a probe to a file and reading
   it (stdout is often dropped):
   ```bash
   export PATH="/home/rexbox/.nvm/versions/node/v20.19.6/bin:$PATH"
   { echo ALIVE; node -v; pnpm -v; echo "===DONE==="; } > BRIDGE_PROBE.txt 2>&1
   ```
   Read `BRIDGE_PROBE.txt`; a wedged bridge writes nothing, a healthy one shows the
   versions. Delete the probe file afterward.

### Prevent it (usage discipline — this is what actually helps)
- **Never overlap `vitest`/`pnpm` runs.** Run one heavy command at a time; wait for its
  sentinel before starting another. Overlapping runs clobber shared logs AND are the main
  source of orphaned workers that wedge the bridge.
- **Never stack `sleep`/poll commands** as separate shell calls to "wait for" a run. Put
  the wait/extract in the *same* invocation as the run (see the sentinel pattern above), or
  poll the sentinel file with the file-reading tool — do not issue standalone `sleep 75`
  calls.
- **Redirect to a log + sentinel and read the file**, never rely on chained follow-up shell
  calls to inspect a still-running command.
- **Clean up scratch files** (`*.log`, `VERIFY.txt`, `BRIDGE_PROBE.txt`, poll files) once a
  run is confirmed, so a later wedge doesn't leave confusing leftovers.

### What does NOT fix the wedging (do not do these as troubleshooting)
- **`apt upgrade` / OS package updates.** Unrelated to the bridge; it only patches Ubuntu
  packages, not the shell integration and not Node/pnpm (those are managed by nvm/corepack
  here). Fine as routine hygiene in a real WSL terminal, but it will not stop the wedging.
- **Upgrading Node.** The toolchain is **pinned to nvm Node v20.19.6** and the full suite
  (typecheck, lint, format:check, unit, integration, build) is green on it. A newer Node
  runs the same `vitest` the same way and leaves the same orphaned workers — no effect on
  the bridge — while risking dependency/ABI/Vite regressions. Only bump Node deliberately
  (update the nvm version, re-run the full green suite), never as a bridge fix.
- **Upgrading pnpm.** Lower risk (managed by corepack) and fine for hygiene, but it does
  nothing for the bridge. If you bump it, pin via corepack and re-run `pnpm install` + the
  full suite to confirm no regression.

**Bottom line:** recover with `pkill -f vitest` + *Developer: Reload Window*; prevent with
run discipline (no overlapping runs, no stacked sleeps, redirect-and-poll). Keep Node at the
pinned v20.19.6 for this work.
