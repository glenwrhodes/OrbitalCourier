import { DEG, type Vec2 } from './vec.ts';

/** Rocks are small belt fragments: they block, but barely pull. */
export type BodyKind = 'planet' | 'moon' | 'rock';

export interface OrbitDef {
  /** Id of the body this one circles. It must be listed earlier. Omit to circle `center`. */
  around?: string;
  /** Fixed point to circle when `around` is omitted. Defaults to the origin. */
  center?: Vec2;
  radius: number;
  /** Seconds per revolution. Positive is clockwise on screen, negative counter-clockwise. */
  period: number;
  /** Angle at t = 0, in degrees: 0 = right of the centre, 90 = below it. */
  phase: number;
}

export interface BodyDef {
  id: string;
  name: string;
  kind: BodyKind;
  radius: number;
  /** Gravitational parameter GM. Acceleration toward the body is mu / r². */
  mu: number;
  /** Fixed position, for bodies that do not move. */
  pos?: Vec2;
  /** Scripted circular orbit, for bodies that do. */
  orbit?: OrbitDef;
}

/** A compiled set of bodies on scripted orbits, laid out in flat arrays for speed. */
export interface System {
  readonly count: number;
  readonly defs: readonly BodyDef[];
  readonly index: ReadonlyMap<string, number>;
  readonly mu: Float64Array;
  readonly radius: Float64Array;
  /** Index of the body this one circles, or -1 for a fixed centre / no orbit. */
  readonly parent: Int32Array;
  /** Fixed position (no orbit) or fixed orbit centre (no parent). */
  readonly baseX: Float64Array;
  readonly baseY: Float64Array;
  /** Orbit radius; 0 for bodies that do not move. */
  readonly orbitR: Float64Array;
  /** Angular speed in rad/s. */
  readonly omega: Float64Array;
  /** Angle at t = 0 in radians. */
  readonly phase: Float64Array;
}

export function compileSystem(defs: readonly BodyDef[]): System {
  const n = defs.length;
  const index = new Map<string, number>();
  const mu = new Float64Array(n);
  const radius = new Float64Array(n);
  const parent = new Int32Array(n).fill(-1);
  const baseX = new Float64Array(n);
  const baseY = new Float64Array(n);
  const orbitR = new Float64Array(n);
  const omega = new Float64Array(n);
  const phase = new Float64Array(n);

  defs.forEach((d, i) => {
    if (index.has(d.id)) throw new Error(`Duplicate body id "${d.id}"`);
    if (!(d.radius > 0)) throw new Error(`Body "${d.id}" needs a positive radius`);
    if (!(d.mu >= 0) || !Number.isFinite(d.mu)) throw new Error(`Body "${d.id}" needs a finite mu >= 0`);
    mu[i] = d.mu;
    radius[i] = d.radius;
    if (d.orbit) {
      const o = d.orbit;
      if (!(o.radius > 0)) throw new Error(`Body "${d.id}" needs a positive orbit radius`);
      if (!Number.isFinite(o.period) || o.period === 0) throw new Error(`Body "${d.id}" needs a non-zero orbit period`);
      if (o.around !== undefined) {
        const p = index.get(o.around);
        if (p === undefined) throw new Error(`Body "${d.id}" orbits "${o.around}", which must be listed before it`);
        parent[i] = p;
      } else {
        baseX[i] = o.center?.x ?? 0;
        baseY[i] = o.center?.y ?? 0;
      }
      orbitR[i] = o.radius;
      omega[i] = (2 * Math.PI) / o.period;
      phase[i] = o.phase * DEG;
    } else if (d.pos) {
      baseX[i] = d.pos.x;
      baseY[i] = d.pos.y;
    } else {
      throw new Error(`Body "${d.id}" needs either a pos or an orbit`);
    }
    index.set(d.id, i);
  });

  return { count: n, defs, index, mu, radius, parent, baseX, baseY, orbitR, omega, phase };
}

export function bodyIndex(sys: System, id: string): number {
  const i = sys.index.get(id);
  if (i === undefined) throw new Error(`Unknown body "${id}"`);
  return i;
}

/** Writes every body's position at time t into out as [x0, y0, x1, y1, ...]. */
export function positionsAt(sys: System, t: number, out: Float64Array, offset = 0): void {
  for (let i = 0; i < sys.count; i++) {
    const o = offset + 2 * i;
    const r = sys.orbitR[i];
    if (r === 0) {
      out[o] = sys.baseX[i];
      out[o + 1] = sys.baseY[i];
      continue;
    }
    const p = sys.parent[i];
    const cx = p >= 0 ? out[offset + 2 * p] : sys.baseX[i];
    const cy = p >= 0 ? out[offset + 2 * p + 1] : sys.baseY[i];
    const a = sys.phase[i] + sys.omega[i] * t;
    out[o] = cx + r * Math.cos(a);
    out[o + 1] = cy + r * Math.sin(a);
  }
}

/** Writes every body's velocity at time t into out as [vx0, vy0, ...]. */
export function velocitiesAt(sys: System, t: number, out: Float64Array): void {
  for (let i = 0; i < sys.count; i++) {
    const o = 2 * i;
    const r = sys.orbitR[i];
    if (r === 0) {
      out[o] = 0;
      out[o + 1] = 0;
      continue;
    }
    const p = sys.parent[i];
    const pvx = p >= 0 ? out[2 * p] : 0;
    const pvy = p >= 0 ? out[2 * p + 1] : 0;
    const w = sys.omega[i];
    const a = sys.phase[i] + w * t;
    out[o] = pvx - r * w * Math.sin(a);
    out[o + 1] = pvy + r * w * Math.cos(a);
  }
}

/** Where the orbit of body i is centred at time t (its parent, or its fixed centre). */
export function orbitCentreAt(sys: System, positions: Float64Array, offset: number, i: number): Vec2 {
  const p = sys.parent[i];
  if (p >= 0) return { x: positions[offset + 2 * p], y: positions[offset + 2 * p + 1] };
  return { x: sys.baseX[i], y: sys.baseY[i] };
}
