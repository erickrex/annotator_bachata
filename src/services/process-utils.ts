/**
 * Process utilities — a shared subprocess runner that consolidates the common
 * `spawn` + timeout + stdout/stderr buffering + close/error lifecycle currently
 * hand-rolled across the subprocess services (ingestion, audio analysis, clip
 * extraction).
 *
 * The helper deliberately captures ONLY the spawn/timeout/buffering shell. It does
 * NOT make exit-code decisions or parse output: adopters keep their own
 * exit-code-to-error logic and parsing so their externally observable behavior
 * (success outputs, error messages, timeouts) is preserved exactly.
 */

import { spawn } from 'node:child_process';

/** Options controlling a single {@link runProcess} invocation. */
export interface RunProcessOptions {
  /** Working directory for the spawned process. Passed through to `spawn` when provided. */
  cwd?: string;
  /** Environment variables for the spawned process. Passed through to `spawn` when provided. */
  env?: NodeJS.ProcessEnv;
  /** Maximum time (in milliseconds) before the process is SIGKILLed and the promise rejects. */
  timeoutMs: number;
  /** Message used to reject the promise when the timeout fires. */
  timeoutMessage: string;
}

/** Result of a completed subprocess (resolved on the `'close'` event). */
export interface ProcessResult {
  /** Full buffered stdout. Always captured; adopters that only need stderr can ignore it. */
  stdout: string;
  /** Full buffered stderr. */
  stderr: string;
  /** Process exit code, or `null` if the process was terminated by a signal. */
  code: number | null;
}

/**
 * Spawn `cmd` with `args`, buffer stdout/stderr, enforce a timeout, and resolve
 * with `{ stdout, stderr, code }` once the process closes.
 *
 * Lifecycle semantics (shared by all adopters):
 * - Spawns with `stdio: ['ignore', 'pipe', 'pipe']` so stdin is ignored while
 *   stdout and stderr are always piped and buffered. None of the non-streaming
 *   adopters write to stdin, so ignoring it is safe.
 * - `cwd` and `env` are forwarded to `spawn` when provided.
 * - Buffers stdout and stderr by concatenating `chunk.toString()` on each
 *   `'data'` event. Both streams are always buffered; callers that only need one
 *   may ignore the other.
 * - On timeout: calls `proc.kill('SIGKILL')` and REJECTS with a new `Error`
 *   whose message is `opts.timeoutMessage`.
 * - On spawn `'error'`: clears the timeout and REJECTS with the raw `Error` from
 *   the `'error'` event (see "Error handling" below).
 * - On `'close'`: clears the timeout and RESOLVES with `{ stdout, stderr, code }`.
 *   It does NOT reject on a non-zero exit code — adopters inspect `code` and apply
 *   their own exit-code-to-error logic and output parsing.
 *
 * ## Error handling (spawn `'error'`)
 *
 * The existing call sites wrap spawn-failure errors with DIFFERENT, caller-specific
 * prefixes (e.g. `"Failed to start audio analysis subprocess: …"`,
 * `"ffmpeg failed to start: …"`, `"uv run yt-dlp failed to start: …"`). To let each
 * adopter preserve its EXACT message, `runProcess` rejects with the ORIGINAL `Error`
 * emitted by the child process. Adopters should `.catch` (or `try/catch`) and
 * re-wrap it, for example:
 *
 * ```ts
 * try {
 *   const { stdout, stderr, code } = await runProcess('ffmpeg', args, {
 *     timeoutMs: 60_000,
 *     timeoutMessage: `ffmpeg timed out extracting clip to ${outputPath}`,
 *   });
 *   // ...caller's own exit-code-to-error logic using `code` / `stderr`...
 * } catch (err) {
 *   // Distinguish the timeout rejection (already the desired message) from a
 *   // spawn error that needs the caller's prefix; re-wrap as needed, e.g.:
 *   throw new Error(`ffmpeg failed to start: ${(err as Error).message}`);
 * }
 * ```
 *
 * Because both the timeout rejection and the spawn-error rejection surface as a
 * rejected promise, adopters that need to apply a prefix ONLY to spawn errors
 * should structure their code so the timeout message is produced here (via
 * `timeoutMessage`) and the spawn-error prefix is applied in their `catch`.
 *
 * @param cmd  The command/executable to spawn.
 * @param args Arguments passed to the command.
 * @param opts Timeout configuration and optional `cwd`/`env`.
 * @returns A promise resolving with the buffered stdout/stderr and exit code.
 * @throws {Error} With message `opts.timeoutMessage` if the timeout elapses.
 * @throws {Error} The raw spawn `'error'` Error if the process fails to start.
 */
export function runProcess(
  cmd: string,
  args: string[],
  opts: RunProcessOptions,
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(opts.timeoutMessage));
    }, opts.timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
