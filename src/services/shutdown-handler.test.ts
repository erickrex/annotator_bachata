import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerShutdownHandlers } from './shutdown-handler.js';
import type { DebouncedSaver } from './project-service.js';

describe('registerShutdownHandlers', () => {
  let mockSaver: DebouncedSaver;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  // Track listeners registered during each test so we can clean them up
  const registeredListeners: Array<{ signal: string; listener: (...args: any[]) => void }> = [];
  let originalOn: typeof process.on;

  beforeEach(() => {
    mockSaver = {
      save: vi.fn(),
      saveManifest: vi.fn(),
      flush: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Intercept process.on to track registered listeners for cleanup
    originalOn = process.on.bind(process);
    const patchedOn = vi.spyOn(process, 'on').mockImplementation((event: any, listener: any) => {
      registeredListeners.push({ signal: event, listener });
      return originalOn(event, listener);
    });
  });

  afterEach(() => {
    // Remove all listeners we registered during the test
    for (const { signal, listener } of registeredListeners) {
      process.removeListener(signal, listener);
    }
    registeredListeners.length = 0;

    vi.restoreAllMocks();
  });

  it('calls flush() when SIGINT is received', async () => {
    registerShutdownHandlers(mockSaver);

    process.emit('SIGINT');

    // flush is async, give it a tick to resolve
    await vi.waitFor(() => {
      expect(mockSaver.flush).toHaveBeenCalledTimes(1);
    });
  });

  it('calls flush() when SIGTERM is received', async () => {
    registerShutdownHandlers(mockSaver);

    process.emit('SIGTERM');

    await vi.waitFor(() => {
      expect(mockSaver.flush).toHaveBeenCalledTimes(1);
    });
  });

  it('calls process.exit(0) when flush succeeds', async () => {
    registerShutdownHandlers(mockSaver);

    process.emit('SIGINT');

    await vi.waitFor(() => {
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  it('calls process.exit(1) when flush throws', async () => {
    (mockSaver.flush as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('disk full'),
    );

    registerShutdownHandlers(mockSaver);

    process.emit('SIGTERM');

    await vi.waitFor(() => {
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  it('logs error to stderr when flush fails', async () => {
    (mockSaver.flush as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('write error'),
    );

    registerShutdownHandlers(mockSaver);

    process.emit('SIGINT');

    await vi.waitFor(() => {
      expect(stderrSpy).toHaveBeenCalled();
      const output = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
      expect(output).toContain('write error');
      expect(output).toContain('SIGINT');
    });
  });

  it('does not call flush twice on double signal (guard against double-flush)', async () => {
    registerShutdownHandlers(mockSaver);

    process.emit('SIGINT');
    process.emit('SIGINT');

    // Wait for the first flush to complete
    await vi.waitFor(() => {
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    // flush should only have been called once despite two signals
    expect(mockSaver.flush).toHaveBeenCalledTimes(1);
  });
});
