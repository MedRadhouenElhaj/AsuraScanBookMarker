export interface PanelPosition {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

const VIEWPORT_MARGIN = 8;

export function clampPanelPosition(
  position: PanelPosition,
  viewport: Size,
  panel: Size,
): PanelPosition {
  return {
    x: Math.min(
      Math.max(VIEWPORT_MARGIN, position.x),
      Math.max(VIEWPORT_MARGIN, viewport.width - panel.width - VIEWPORT_MARGIN),
    ),
    y: Math.min(
      Math.max(VIEWPORT_MARGIN, position.y),
      Math.max(VIEWPORT_MARGIN, viewport.height - panel.height - VIEWPORT_MARGIN),
    ),
  };
}
