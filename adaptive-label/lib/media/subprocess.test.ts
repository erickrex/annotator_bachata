import { describe, expect, it } from "vitest";

import { runProcess } from "./subprocess";

describe("runProcess", () => {
  it("captures stdout and stderr for a successful process", async () => {
    const result = await runProcess(
      process.execPath,
      ["-e", "console.log('ok'); console.error('warn')"],
      { timeoutMs: 5_000, timeoutMessage: "timed out" },
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
    expect(result.stderr.trim()).toBe("warn");
  });

  it("resolves non-zero exits with the exit code and stderr", async () => {
    const result = await runProcess(
      process.execPath,
      ["-e", "console.error('bad'); process.exit(7)"],
      { timeoutMs: 5_000, timeoutMessage: "timed out" },
    );

    expect(result.code).toBe(7);
    expect(result.stderr.trim()).toBe("bad");
  });

  it("rejects when the process times out", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], {
        timeoutMs: 25,
        timeoutMessage: "process timed out",
      }),
    ).rejects.toThrow("process timed out");
  });

  it("rejects when the executable cannot be spawned", async () => {
    await expect(
      runProcess("__adaptive_label_missing_binary__", [], {
        timeoutMs: 5_000,
        timeoutMessage: "timed out",
      }),
    ).rejects.toThrow();
  });
});
