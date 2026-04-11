import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VirtualClipDef } from '../types/index.js';

const renderMediaMock = vi.fn();
const bundleMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock('@remotion/renderer', () => ({
  bundle: bundleMock,
  renderMedia: renderMediaMock,
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
}));

vi.mock('./app-state.js', () => ({
  getAppState: () => ({
    projectDir: '/project',
  }),
}));

function makeClip(overrides: Partial<VirtualClipDef> = {}): VirtualClipDef {
  return {
    clipId: 'src1_c001_016',
    sourceId: 'src1',
    status: 'pending',
    remotion: {
      fromFrame: 120,
      durationInFrames: 151,
      fps: 30,
    },
    beatMarkerFrames: [0, 15, 30],
    cycleNumber: 1,
    beatCount: 16,
    ...overrides,
  };
}

describe('export-service', () => {
  beforeEach(() => {
    vi.resetModules();
    renderMediaMock.mockReset().mockResolvedValue({ buffer: null, slowestFrames: [], contentType: 'video/mp4' });
    bundleMock.mockReset().mockResolvedValue('/tmp/remotion-bundle');
    mkdirMock.mockReset().mockResolvedValue(undefined);
  });

  it('renders clip-local frame ranges and passes energy profile', async () => {
    const { exportClip } = await import('./export-service.js');

    await exportClip(
      makeClip(),
      '/project/sources/src1.mp4',
      '/project/exports',
      [0.1, 0.2, 0.3],
    );

    expect(bundleMock).toHaveBeenCalledWith({
      entryPoint: '/project/src/remotion/index.ts',
      onProgress: expect.any(Function),
    });
    expect(renderMediaMock).toHaveBeenCalledWith(expect.objectContaining({
      outputLocation: '/project/exports/src1_c001_016.mp4',
      frameRange: [0, 150],
      composition: expect.objectContaining({
        fps: 30,
        durationInFrames: 151,
        defaultProps: expect.objectContaining({
          src: '/project/sources/src1.mp4',
          startFrame: 120,
          beatMarkers: [0, 15, 30],
          energyProfile: [0.1, 0.2, 0.3],
        }),
      }),
    }));
  });

  it('reuses the bundled Remotion project across batch exports', async () => {
    const { exportBatch } = await import('./export-service.js');

    const clips = [
      makeClip({ clipId: 'src1_c001_008', beatCount: 8 }),
      makeClip({
        clipId: 'src1_c002_008',
        beatCount: 8,
        remotion: { fromFrame: 271, durationInFrames: 71, fps: 30 },
      }),
    ];

    const exported: string[] = [];
    for await (const result of exportBatch(
      clips,
      () => ({ sourceVideoPath: '/project/sources/src1.mp4', energyProfile: [0.5] }),
      '/project/exports',
      () => {},
    )) {
      exported.push(result.clipId);
    }

    expect(exported).toEqual(['src1_c001_008', 'src1_c002_008']);
    expect(bundleMock).toHaveBeenCalledTimes(1);
    expect(renderMediaMock).toHaveBeenCalledTimes(2);
  });
});
