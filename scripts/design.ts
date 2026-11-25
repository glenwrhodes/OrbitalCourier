// Level design helper: sweeps launch heading × power for each level, reports
// how many launches deliver, the cheapest one, and a robust stored solution
// (the middle of a wide window of working launches, so it is not a knife edge).
//
//   npm run design                      all levels
//   npm run design -- 3 7               just levels 3 and 7
//   npm run design -- 4 --plot          also draw scripts/out/level-04.png
//   npm run design -- 4 --without=runner   switch off a body's gravity to see what it adds
//   npm run design -- 9 --burn=240:330:1   fly every launch with a fixed burn (ticks, dir)
import { LEVELS } from '../src/core/levels.ts';
import type { Level, Solution } from '../src/core/level.ts';
import { runSolution, fuelUsed, type Session } from '../src/core/sim.ts';
import { createWorld, type World } from '../src/core/world.ts';
import { TRAIL_EVERY, TICK_RATE, WORLD_HEIGHT, WORLD_WIDTH } from '../src/core/constants.ts';
import { Plot } from './plot.ts';

const args = process.argv.slice(2);
const withPlot = args.includes('--plot');
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
// --without=id: switch off that body's gravity (it still blocks), to see what it contributes.
const without = args.find((a) => a.startsWith('--without='))?.slice(10);
// --burn=start:end:dir: fly every launch with this fixed burn.
const fixedBurn = args.find((a) => a.startsWith('--burn='))?.slice(7).split(':').map(Number);
const fixedBurns: Solution['burns'] = fixedBurn ? [{ start: fixedBurn[0], end: fixedBurn[1], dir: fixedBurn[2] === -1 ? -1 : 1 }] : [];
// --minpower=N: only consider launches at least this strong.
const minPower = Number(args.find((a) => a.startsWith('--minpower='))?.slice(11) ?? 30);
const levels = (ids.length ? LEVELS.filter((l) => ids.includes(l.id)) : LEVELS).map((l) =>
  without ? { ...l, bodies: l.bodies.map((b) => (b.id === without ? { ...b, mu: 0 } : b)) } : l,
);

interface Cell {
  ok: boolean;
  /** The whole flight stays on the visible screen (nicer for the demo video). */
  onscreen: boolean;
  ticks: number;
}

function staysOnScreen(trail: number[]): boolean {
  for (let i = 0; i < trail.length; i += 2) {
    if (Math.abs(trail[i]) > WORLD_WIDTH / 2 - 10 || Math.abs(trail[i + 1]) > WORLD_HEIGHT / 2 - 10) return false;
  }
  return true;
}

function sweep(level: Level, world: World, h0: number, h1: number, hStep: number, p0: number, p1: number, pStep: number, burns: Solution['burns'] = []) {
  const hs: number[] = [];
  for (let h = h0; h < h1 - 1e-9; h += hStep) hs.push(round(h, 3));
  const ps: number[] = [];
  for (let p = p0; p <= p1 + 1e-9; p += pStep) ps.push(round(p, 3));
  const grid: Cell[][] = hs.map((heading) =>
    ps.map((power) => {
      const s = runSolution(level, { heading, power, burns }, world);
      const ok = s.outcome?.reason === 'delivered' && fuelUsed(s) <= level.fuel + 1e-9;
      return { ok, onscreen: ok && staysOnScreen(s.trail), ticks: s.outcome?.tick ?? 0 };
    }),
  );
  return { hs, ps, grid };
}

/** Prefers launches whose flight stays on screen; falls back to any working launch. */
function robustPick(hs: number[], ps: number[], grid: Cell[][], wrap: boolean, rh: number, rp: number) {
  return robustPickWhere(hs, ps, grid, wrap, rh, rp, (c) => c.onscreen) ?? robustPickWhere(hs, ps, grid, wrap, rh, rp, (c) => c.ok);
}

function robustPickWhere(hs: number[], ps: number[], grid: Cell[][], wrap: boolean, rh: number, rp: number, want: (c: Cell) => boolean) {
  let best: { i: number; j: number; score: number } | null = null;
  for (let i = 0; i < hs.length; i++) {
    for (let j = 0; j < ps.length; j++) {
      if (!want(grid[i][j])) continue;
      let score = 0;
      for (let di = -rh; di <= rh; di++) {
        let ii = i + di;
        if (wrap) ii = (ii + hs.length) % hs.length;
        if (ii < 0 || ii >= hs.length) continue;
        for (let dj = -rp; dj <= rp; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= ps.length) continue;
          if (grid[ii][jj].ok) score++;
        }
      }
      // Prefer robust launches, then cheaper ones.
      if (!best || score > best.score || (score === best.score && ps[j] < ps[best.j])) best = { i, j, score };
    }
  }
  return best;
}

/**
 * Moves a working launch to the point deepest inside its window: the cell
 * furthest from any failing launch, measuring distance in steps of 0.05° of
 * heading and 0.25 of power (what tests/levels.test.ts perturbs by).
 */
function centre(level: Level, world: World, h0: number, p0: number) {
  const H = 0.04;
  const P = 0.2;
  const N = 25;
  const okCells: [number, number][] = [];
  const bad: [number, number][] = [];
  for (let i = -N; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      const power = p0 + j * P;
      const s = runSolution(level, { heading: h0 + i * H, power, burns: fixedBurns }, world);
      const ok = s.outcome?.reason === 'delivered' && power <= level.maxLaunch && fuelUsed(s) <= level.fuel && staysOnScreen(s.trail);
      (ok ? okCells : bad).push([i, j]);
    }
  }
  // Every launch nearby works: the start point is already deep inside.
  if (bad.length === 0) return { heading: h0, power: p0, depth: Infinity };
  let best = { heading: h0, power: p0, depth: 0 };
  for (const [i, j] of okCells) {
    let depth = Infinity;
    for (const [a, b] of bad) depth = Math.min(depth, Math.hypot(((a - i) * H) / 0.05, ((b - j) * P) / 0.25));
    if (depth > best.depth) best = { heading: h0 + i * H, power: p0 + j * P, depth };
  }
  return best;
}

function closestApproaches(s: Session, world: World): string {
  const parts: string[] = [];
  for (let b = 0; b < world.sys.count; b++) {
    const def = world.sys.defs[b];
    if (def.kind !== 'planet') continue;
    let best = Infinity;
    for (let k = 0; k < s.trail.length / 2; k++) {
      const tick = Math.min(k * TRAIL_EVERY, world.maxTick);
      const dx = s.trail[2 * k] - world.table[tick * world.stride + 2 * b];
      const dy = s.trail[2 * k + 1] - world.table[tick * world.stride + 2 * b + 1];
      best = Math.min(best, Math.hypot(dx, dy) - def.radius);
    }
    parts.push(`${def.name}:${best.toFixed(0)}`);
  }
  return parts.join(' ');
}

function plotLevel(level: Level, world: World, coarse: ReturnType<typeof sweep>, sol: Solution): void {
  const p = new Plot(1104, 648, 0.5);
  p.frame(960, 540, [70, 70, 70]);
  p.frame(world.bounds.maxX, world.bounds.maxY, [40, 20, 20]);
  const { sys, table, stride } = world;
  for (let b = 0; b < sys.count; b++) {
    for (let k = 0; k <= world.maxTick; k += 30) p.circle(table[k * stride + 2 * b], table[k * stride + 2 * b + 1], 1, [60, 60, 60]);
  }
  // Every working coarse launch, faint; the cheapest in amber; the stored one bright.
  let cheapest: Solution | null = null;
  coarse.grid.forEach((row, i) => row.forEach((c, j) => {
    if (!c.ok) return;
    const s = { heading: coarse.hs[i], power: coarse.ps[j], burns: fixedBurns };
    if (!cheapest || s.power < cheapest.power) cheapest = s;
    p.path(runSolution(level, s, world).trail, [0, 150, 200], 0.15);
  }));
  if (cheapest) p.path(runSolution(level, cheapest, world).trail, [255, 170, 60]);
  const s = runSolution(level, sol, world);
  p.path(s.trail, [120, 230, 255]);
  for (let b = 0; b < sys.count; b++) {
    const c: [number, number, number] = b === world.target ? [110, 255, 160] : b === world.pickup ? [255, 200, 80] : [230, 230, 230];
    p.circle(table[2 * b], table[2 * b + 1], sys.radius[b], c);
    const ae = s.outcome ? s.outcome.tick : 0;
    if (b === world.target) {
      p.circle(table[ae * stride + 2 * b], table[ae * stride + 2 * b + 1], world.deliveryRadius, c, 1, true);
    }
  }
  const file = `scripts/out/level-${String(level.id).padStart(2, '0')}.png`;
  p.save(file);
  console.log(`  plot: ${file}`);
}

function round(v: number, d: number): number {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

for (const level of levels) {
  const t0 = Date.now();
  const world = createWorld(level);
  const coarse = sweep(level, world, 0, 360, 1, minPower, level.maxLaunch, 5, fixedBurns);
  let total = 0;
  let cheapest = Infinity;
  coarse.grid.forEach((row) => row.forEach((c, j) => {
    if (c.ok) {
      total++;
      cheapest = Math.min(cheapest, coarse.ps[j]);
    }
  }));
  console.log(`\nLevel ${level.id} ${level.name}: ${total} of ${coarse.hs.length * coarse.ps.length} coarse launches deliver; cheapest ≈ ${cheapest === Infinity ? '-' : cheapest}  (${Date.now() - t0} ms)`);

  const pick = robustPick(coarse.hs, coarse.ps, coarse.grid, true, 2, 2);
  if (pick) {
    const fine = sweep(level, world, coarse.hs[pick.i] - 2, coarse.hs[pick.i] + 2, 0.1, Math.max(minPower, coarse.ps[pick.j] - 8), Math.min(level.maxLaunch, coarse.ps[pick.j] + 8), 0.5, fixedBurns);
    const fp = robustPick(fine.hs, fine.ps, fine.grid, false, 6, 6);
    if (fp) {
      const c = centre(level, world, fine.hs[fp.i], fine.ps[fp.j]);
      const sol: Solution = { heading: round(((c.heading % 360) + 360) % 360, 2), power: round(c.power, 1), burns: fixedBurns };
      const s = runSolution(level, sol, world);
      console.log(`  robust: ${JSON.stringify(sol)} → ${s.outcome?.reason} at ${(s.tick / TICK_RATE).toFixed(1)} s, fuel used ${fuelUsed(s).toFixed(1)} / ${level.fuel}, window ${fp.score}/169 fine cells, ${Number.isFinite(c.depth) ? c.depth.toFixed(1) : '25+'} steps from the edge${staysOnScreen(s.trail) ? '' : ', LEAVES SCREEN'}`);
      console.log(`  clearance: ${closestApproaches(s, world)}`);
      if (withPlot) plotLevel(level, world, coarse, sol);
    }
  }
}
