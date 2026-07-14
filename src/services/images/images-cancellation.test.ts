import { describe, it, expect } from 'vitest';
import { loadImage } from './images.js';
import { writeTempFile, TINY_PNG_BYTES, TINY_PNG_DATA_URL } from '../../test/utils/index.js';

describe('loadImage cancellation (file and data URL paths)', () => {
  it('throws Request cancelled for a file source when the signal is already aborted', async () => {
    const file = writeTempFile(TINY_PNG_BYTES, 'img.png');
    try {
      const controller = new AbortController();
      controller.abort();
      const err = await loadImage(file.path, 5, 60_000, controller.signal).catch((e) => e);
      expect((err as Error).message).toBe('Request cancelled');
    } finally {
      file.cleanup();
    }
  });

  it('throws Request cancelled for a data URL when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const err = await loadImage(TINY_PNG_DATA_URL, 5, 60_000, controller.signal).catch((e) => e);
    expect((err as Error).message).toBe('Request cancelled');
  });
});
