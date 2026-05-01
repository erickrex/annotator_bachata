// Shutdown Handler — flushes pending saves on SIGINT/SIGTERM before exit.

import type { DebouncedSaver } from './project-service.js';

/**
 * Register process signal handlers that flush the debounced saver before exit.
 *
 * - On SIGINT or SIGTERM: flush pending writes, then exit 0.
 * - If flush fails: log to stderr and exit 1.
 * - Guards against double-flush with an internal flag.
 */
export function registerShutdownHandlers(saver: DebouncedSaver): void {
  let isShuttingDown = false;

  const handler = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    try {
      await saver.flush();
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Shutdown flush failed (${signal}): ${message}\n`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handler('SIGINT'));
  process.on('SIGTERM', () => void handler('SIGTERM'));
}
