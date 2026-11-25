import { describe, expect, it } from 'vitest';
import { LAUNCH_CLEARANCE, THRUST_ACCEL, TICK_RATE } from '../src/core/constants.ts';
import { LEVELS } from '../src/core/levels.ts';
import { runSolution } from '../src/core/sim.ts';
import { headingToDir } from '../src/core/vec.ts';
import { bodyX, bodyY } from '../src/core/world.ts';
import type { View } from '../src/render/draw.ts';
import { drawGame } from '../src/render/frame.ts';
import { DEMO_LAUNCH_MS, type DemoState } from '../src/ui/demo.ts';
import { createGame, IDLE_INPUT, updateGame, type Game, type InputFrame } from '../src/ui/game.ts';

/** A canvas context that accepts every call and fails on any non-finite number. */
function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { letterSpacing: '0px', globalAlpha: 1, lineWidth: 1 };
  const check = (name: string, args: unknown[]) => {
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${name} called with ${a}`);
    }
  };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: s.length * 9 });
      return (...args: unknown[]) => check(String(k), args);
    },
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${String(k)} set to ${v}`);
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const view: View = { scale: 1, lw: 1 };

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...IDLE_INPUT, ...over, pointer: { ...IDLE_INPUT.pointer, ...over.pointer } };
}

function runDemo(levelIndex: number, fps: number, speed = 1, onFrame?: (g: Game, ts: number) => void) {
  const states: DemoState[] = [];
  const g = createGame({ startLevel: levelIndex, demo: { speed }, onDemoState: (s) => states.push(s) });
  const ctx = fakeCtx();
  for (let i = 0; i < fps * 120; i++) {
    const ts = 1000 + (i * 1000) / fps;
    updateGame(g, ts, IDLE_INPUT);
    drawGame(ctx, view, g, ts);
    onFrame?.(g, ts);
    if (g.play?.demo?.state === 'done') break;
  }
  return { g, states };
}

describe('demo mode', () => {
  it.each(LEVELS.map((l, i) => [l.id, i] as const))('plays level %i through the game and renderer to a delivery', (_id, i) => {
    const { g, states } = runDemo(i, 60);
    const s = g.play!.session;
    expect(states).toEqual(['intro', 'aiming', 'flying', 'ended', 'done']);
    expect(s.outcome?.reason).toBe('delivered');
    // Exactly the same flight as the stored-solution test.
    const ref = runSolution(LEVELS[i]);
    expect(s.tick).toBe(ref.tick);
    expect(s.ship).toEqual(ref.ship);
  });

  it('shows the same thing at the same moment whatever the frame rate', () => {
    const level = LEVELS.findIndex((l) => l.solution.burns.length > 0);
    const snapshots = new Map<number, Map<number, string>>();
    for (const fps of [24, 60, 120]) {
      const snap = new Map<number, string>();
      // Compare at every 1/12 s, a moment all three frame rates land on.
      const every = fps / 12;
      let frame = 0;
      runDemo(level, fps, 1, (g) => {
        if (frame % every === 0) {
          const p = g.play!;
          const s = p.session;
          snap.set(frame / every, JSON.stringify([p.demo!.state, s.phase, s.heading, s.power, s.tick, s.ship, s.fuel, p.endTs]));
        }
        frame++;
      });
      snapshots.set(fps, snap);
    }
    const a = snapshots.get(24)!;
    const b = snapshots.get(60)!;
    const c = snapshots.get(120)!;
    expect(a.size).toBeGreaterThan(100);
    for (const [k, v] of a) {
      if (!b.has(k) || !c.has(k)) continue;
      expect(b.get(k), `moment ${k}`).toBe(v);
      expect(c.get(k), `moment ${k}`).toBe(v);
    }
  }, 60_000);

  it('launches at a fixed time and runs at the requested speed', () => {
    const g = createGame({ startLevel: 0, demo: { speed: 2 } });
    updateGame(g, 500, IDLE_INPUT);
    updateGame(g, 500 + DEMO_LAUNCH_MS - 1, IDLE_INPUT);
    expect(g.play!.session.phase).toBe('aiming');
    updateGame(g, 500 + DEMO_LAUNCH_MS + 1000, IDLE_INPUT);
    expect(g.play!.session.phase).toBe('flying');
    expect(g.play!.session.tick).toBe(2 * TICK_RATE);
  });

  it('ignores player input', () => {
    const g = createGame({ startLevel: 0, demo: { speed: 1 } });
    updateGame(g, 0, IDLE_INPUT);
    updateGame(g, 100, input({ presses: ['Escape', 'Space'] }));
    expect(g.screen).toBe('play');
    expect(g.play!.session.phase).toBe('aiming');
  });
});

describe('live play', () => {
  function pointAt(g: Game, heading: number, power: number) {
    const w = g.play!.session.world;
    const d = headingToDir(heading);
    const r = w.sys.radius[w.pickup] + LAUNCH_CLEARANCE + power;
    return { x: bodyX(w, 0, w.pickup) + d.x * r, y: bodyY(w, 0, w.pickup) + d.y * r };
  }

  function frames(g: Game, from: number, count: number, frame: Partial<InputFrame> = {}, ctx = fakeCtx()) {
    let ts = from;
    for (let i = 0; i < count; i++) {
      ts += 1000 / 60;
      updateGame(g, ts, input(frame));
      drawGame(ctx, view, g, ts);
    }
    return ts;
  }

  it('goes from the title into level 1 with Enter, and back with Escape', () => {
    const g = createGame();
    const ctx = fakeCtx();
    updateGame(g, 0, IDLE_INPUT);
    drawGame(ctx, view, g, 0);
    expect(g.screen).toBe('title');
    updateGame(g, 16, input({ presses: ['Enter'] }));
    expect(g.screen).toBe('play');
    expect(g.play!.levelIndex).toBe(0);
    updateGame(g, 32, input({ presses: ['Escape'] }));
    expect(g.screen).toBe('title');
  });

  it('aims by dragging, launches on release and delivers level 1', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const sol = LEVELS[0].solution;
    const start = pointAt(g, sol.heading - 30, 60);
    const end = pointAt(g, sol.heading, sol.power);
    updateGame(g, 16, input({ pointer: { ...start, down: true, pressed: true, released: false } }));
    expect(g.play!.dragging).toBe(true);
    updateGame(g, 32, input({ pointer: { ...end, down: true, pressed: false, released: false } }));
    const s = g.play!.session;
    expect(s.heading).toBeCloseTo(sol.heading, 6);
    expect(s.power).toBeCloseTo(sol.power, 6);
    expect(g.play!.preview?.points.length).toBeGreaterThan(10);
    updateGame(g, 48, input({ pointer: { ...end, down: false, pressed: false, released: true } }));
    expect(s.phase).toBe('flying');
    frames(g, 48, 60 * 30);
    expect(s.outcome?.reason).toBe('delivered');
  });

  it('fine-tunes the aim with the arrow keys and launches with Space', () => {
    const g = createGame({ startLevel: 2 });
    updateGame(g, 0, IDLE_INPUT);
    const s = g.play!.session;
    const h = s.heading;
    const p = s.power;
    updateGame(g, 16, input({ presses: ['ArrowRight', 'ArrowRight', 'ArrowUp'] }));
    expect(s.heading).toBeCloseTo(h + 2, 9);
    expect(s.power).toBe(p + 5);
    updateGame(g, 32, input({ presses: ['ArrowLeft'], shift: true }));
    expect(s.heading).toBeCloseTo(h + 1.9, 9);
    updateGame(g, 48, input({ presses: ['Space'] }));
    expect(s.phase).toBe('flying');
  });

  it('burns while W is held, warps with 1-3, pauses with P, restarts with R', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    updateGame(g, 16, input({ presses: ['Space'] }));
    const s = g.play!.session;
    const fuelAtLaunch = s.fuel;
    let ts = frames(g, 16, 60, { held: new Set(['KeyW']) });
    expect(s.burnDv).toBeCloseTo((s.tick * THRUST_ACCEL) / TICK_RATE, 6);
    expect(s.fuel).toBeLessThan(fuelAtLaunch);

    updateGame(g, (ts += 16), input({ presses: ['Digit3'] }));
    const t0 = s.tick;
    ts = frames(g, ts, 30);
    expect(s.tick - t0).toBeGreaterThan(220); // ≈ 0.5 s × 4 × 120

    updateGame(g, (ts += 16), input({ presses: ['KeyP'] }));
    const t1 = s.tick;
    ts = frames(g, ts, 30);
    expect(s.tick).toBe(t1);

    updateGame(g, (ts += 16), input({ presses: ['KeyR'] }));
    expect(g.play!.session).not.toBe(s);
    expect(g.play!.session.phase).toBe('aiming');
  });

  it('moves on to the next level with Enter after a delivery, and retries after a failure', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const sol = LEVELS[0].solution;
    const end = pointAt(g, sol.heading, sol.power);
    updateGame(g, 16, input({ pointer: { ...end, down: true, pressed: true, released: true } }));
    let ts = frames(g, 16, 60 * 30);
    expect(g.play!.session.outcome?.reason).toBe('delivered');
    expect(g.play!.endTs).not.toBeNull();
    updateGame(g, (ts += 16), input({ presses: ['Enter'] }));
    expect(g.play!.levelIndex).toBe(1);

    // Fly level 2 straight into GOLIATH, then retry.
    const w = g.play!.session.world;
    const gi = w.sys.index.get('goliath')!;
    const p = { x: bodyX(w, 0, gi), y: bodyY(w, 0, gi) };
    updateGame(g, (ts += 16), input({ pointer: { ...p, down: true, pressed: true, released: true } }));
    ts = frames(g, ts, 60 * 20);
    expect(g.play!.session.outcome?.reason).not.toBe('delivered');
    updateGame(g, (ts += 16), input({ presses: ['Enter'] }));
    expect(g.play!.levelIndex).toBe(1);
    expect(g.play!.session.phase).toBe('aiming');
  });
});
