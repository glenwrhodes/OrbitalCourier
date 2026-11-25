export interface Vec2 {
  x: number;
  y: number;
}

export const DEG = Math.PI / 180;

/**
 * Headings are compass-style: 0° points up the screen, angles grow clockwise.
 * (The world's y axis points down, matching the canvas.)
 */
export function headingToDir(headingDeg: number): Vec2 {
  const r = headingDeg * DEG;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

export function dirToHeading(x: number, y: number): number {
  return normalizeHeading(Math.atan2(x, -y) / DEG);
}

export function normalizeHeading(h: number): number {
  const n = h % 360;
  return n < 0 ? n + 360 : n;
}

/** Signed shortest turn from heading a to heading b, in (-180, 180]. */
export function headingDelta(a: number, b: number): number {
  let d = normalizeHeading(b - a);
  if (d > 180) d -= 360;
  return d;
}

/** Squared distance from the origin to the segment a→b. */
export function segmentOriginDistSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let s = l2 > 0 ? -(ax * dx + ay * dy) / l2 : 0;
  if (s < 0) s = 0;
  else if (s > 1) s = 1;
  const px = ax + dx * s;
  const py = ay + dy * s;
  return px * px + py * py;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
