import { describe, expect, it } from 'vitest';
import { clampPanelPosition } from './panel';

describe('tracker panel positioning', () => {
  it('keeps a dragged panel inside the viewport', () => {
    expect(
      clampPanelPosition(
        { x: 900, y: -20 },
        { width: 800, height: 600 },
        { width: 300, height: 90 },
      ),
    ).toEqual({ x: 492, y: 8 });
  });

  it('preserves an already visible position', () => {
    expect(
      clampPanelPosition(
        { x: 120, y: 220 },
        { width: 800, height: 600 },
        { width: 300, height: 90 },
      ),
    ).toEqual({ x: 120, y: 220 });
  });
});
