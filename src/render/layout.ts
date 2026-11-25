// Screen areas the HUD covers, in world coordinates. Levels keep their bodies
// out of these (tests/levels.test.ts checks it), so nothing hides under a panel.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Telemetry panel, top left. */
export const TELEMETRY: Rect = { x: -936, y: -516, w: 340, h: 232 };

/** Flight plan panel, top right, at its tallest (three lines of brief). */
export const FLIGHT_PLAN: Rect = { x: 556, y: -516, w: 380, h: 113 };

/** Status line and key hints along the bottom edge. */
export const BOTTOM_BAR: Rect = { x: -960, y: 480, w: 1920, h: 60 };

export const HUD_RECTS: readonly Rect[] = [TELEMETRY, FLIGHT_PLAN, BOTTOM_BAR];

/** Whether a circle overlaps a rectangle. */
export function circleHitsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
