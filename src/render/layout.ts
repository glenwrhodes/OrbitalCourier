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

/** Level select: a 5 × 2 grid of cards. */
export const SELECT_COLS = 5;
const CARD_W = 330;
const CARD_H = 290;
const GAP_X = 24;
const GAP_Y = 36;
const GRID_TOP = -330;

export function selectCardRect(index: number): Rect {
  const col = index % SELECT_COLS;
  const row = Math.floor(index / SELECT_COLS);
  const totalW = SELECT_COLS * CARD_W + (SELECT_COLS - 1) * GAP_X;
  return { x: -totalW / 2 + col * (CARD_W + GAP_X), y: GRID_TOP + row * (CARD_H + GAP_Y), w: CARD_W, h: CARD_H };
}

/** Index of the level select card under a point, or -1. */
export function selectCardAt(x: number, y: number, count: number): number {
  for (let i = 0; i < count; i++) {
    const r = selectCardRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/** Whether a circle overlaps a rectangle. */
export function circleHitsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
