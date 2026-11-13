import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from './index';

describe('smoke', () => {
  it('eksportuje wersję silnika', () => {
    expect(ENGINE_VERSION).toBe('0.1.0');
  });
});
