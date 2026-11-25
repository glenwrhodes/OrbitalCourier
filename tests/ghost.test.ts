import { describe, expect, it } from 'vitest';
import { TRAIL_EVERY } from '../src/core/constants.ts';
import { GHOST_EVERY, ghostAt, ghostFromTrail, ghostSampleCount, isGhost } from '../src/core/ghost.ts';
import { LEVELS } from '../src/core/levels.ts';
import { createSession, launch, setAim, stepSession } from '../src/core/sim.ts';
import { thrustAt } from '../src/core/solution.ts';

/** A trail shaped like Session.trail for a ship at (tick, -2·tick): a point every TRAIL_EVERY ticks, then the end. */
function straightTrail(endTick: number): number[] {
  const t: number[] = [];
  for (let tick = 0; tick <= endTick; tick += TRAIL_EVERY) t.push(tick, -2 * tick);
  if (endTick % TRAIL_EVERY !== 0) t.push(endTick, -2 * endTick);
  return t;
}

describe('building a ghost', () => {
  it('samples every GHOST_EVERY ticks and ends exactly where the flight ended', () => {
    for (const end of [12, 13, 14, 1, 2, 3]) {
      const g = ghostFromTrail(straightTrail(end), end);
      expect(g.every).toBe(GHOST_EVERY);
      expect(g.ticks).toBe(end);
      expect(g.points.length / 2).toBe(ghostSampleCount(GHOST_EVERY, end));
      const xs = g.points.filter((_, i) => i % 2 === 0);
      const expected = [];
      for (let t = 0; t < end; t += GHOST_EVERY) expected.push(t);
      expected.push(end);
      expect(xs).toEqual(expected);
    }
  });

  it('rounds coordinates to a tenth', () => {
    const g = ghostFromTrail([1.234, -5.678, 9.999, 0.04], 2);
    expect(g.points).toEqual([1.2, -5.7, 10, 0]);
  });
});

describe('replaying a ghost', () => {
  const g = ghostFromTrail(straightTrail(13), 13);

  it('is exact on samples and linear between them', () => {
    for (const t of [0, 4, 8, 12, 13, 1, 5.5, 12.5, 10]) {
      const p = ghostAt(g, t);
      expect(p.x).toBeCloseTo(t, 9);
      expect(p.y).toBeCloseTo(-2 * t, 9);
    }
  });

  it('points along the direction of travel', () => {
    expect(ghostAt(g, 3).angle).toBeCloseTo(Math.atan2(-2, 1), 9);
  });

  it('holds the start before launch and the end once its flight is over', () => {
    expect(ghostAt(g, -10)).toMatchObject({ x: 0, y: 0, finished: false });
    expect(ghostAt(g, 12.9).finished).toBe(false);
    expect(ghostAt(g, 13).finished).toBe(true);
    expect(ghostAt(g, 500)).toMatchObject({ x: 13, y: -26, finished: true });
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('follows the real flight of level %i to within a pixel', (_id, level) => {
    const s = createSession(level);
    setAim(s, level.solution.heading, level.solution.power);
    launch(s);
    const real: number[] = [s.ship.x, s.ship.y];
    while (s.phase === 'flying') {
      stepSession(s, thrustAt(level.solution, s.tick));
      real.push(s.ship.x, s.ship.y);
    }
    const ghost = ghostFromTrail(s.trail, s.tick);
    let worst = 0;
    for (let t = 0; t <= s.tick; t++) {
      const p = ghostAt(ghost, t);
      worst = Math.max(worst, Math.hypot(p.x - real[2 * t], p.y - real[2 * t + 1]));
    }
    expect(worst).toBeLessThan(1);
    // Small enough to keep one per level in localStorage without worry.
    expect(JSON.stringify(ghost).length).toBeLessThan(12_000);
  });
});

describe('validating stored ghosts', () => {
  const good = ghostFromTrail(straightTrail(13), 13);

  it('accepts a ghost that went through JSON', () => {
    const back = JSON.parse(JSON.stringify(good));
    expect(isGhost(back)).toBe(true);
    expect(back).toEqual(good);
  });

  it('rejects damaged ghosts', () => {
    const bad: unknown[] = [
      null,
      42,
      [],
      { every: 4, ticks: 13 },
      { ...good, points: good.points.slice(0, -2) },
      { ...good, points: [...good.points, 1] },
      { ...good, points: good.points.map((v, i) => (i === 3 ? String(v) : v)) },
      { ...good, points: good.points.map((v, i) => (i === 3 ? null : v)) },
      { ...good, every: 0 },
      { ...good, every: 2.5 },
      { ...good, ticks: -1 },
      { ...good, ticks: 17 }, // sample count no longer matches
    ];
    for (const g of bad) expect(isGhost(g), JSON.stringify(g)).toBe(false);
  });
});
