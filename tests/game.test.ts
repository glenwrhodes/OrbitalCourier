import { describe, expect, it } from 'vitest';
import { LAUNCH_CLEARANCE, THRUST_ACCEL, TICK_RATE } from '../src/core/constants.ts';
import { LEVELS } from '../src/core/levels.ts';
import { runSolution } from '../src/core/sim.ts';
import { headingToDir } from '../src/core/vec.ts';
import { bodyX, bodyY } from '../src/core/world.ts';
import type { View } from '../src/render/draw.ts';
import { drawGame } from '../src/render/frame.ts';
import { DEMO_LAUNCH_MS, type DemoState } from '../src/ui/demo.ts';
import { STORAGE_KEY } from '../src/core/progress.ts';
import { ghostAt, isGhost } from '../src/core/ghost.ts';
import { selectCardRect } from '../src/render/layout.ts';
import { createGame, cursorFor, IDLE_INPUT, updateGame, type Game, type InputFrame, type PointerFrame } from '../src/ui/game.ts';
import { MemoryStorage } from './helpers.ts';

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

/** An input frame. The press position defaults to the pointer position. */
function input(over: Omit<Partial<InputFrame>, 'pointer'> & { pointer?: Partial<PointerFrame> } = {}): InputFrame {
  const p = { ...IDLE_INPUT.pointer, ...over.pointer };
  if (over.pointer?.pressX === undefined) p.pressX = p.x;
  if (over.pointer?.pressY === undefined) p.pressY = p.y;
  return { ...IDLE_INPUT, ...over, pointer: p };
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
    expect(g.play!.result?.stars).toBe(3);
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

  /** Press on the ship, drag to `to` and release there: three frames from `ts`. */
  function dragFromShip(g: Game, ts: number, to: { x: number; y: number }): number {
    const ship = { x: g.play!.session.ship.x, y: g.play!.session.ship.y };
    updateGame(g, (ts += 16), input({ pointer: { ...ship, down: true, pressed: true } }));
    updateGame(g, (ts += 16), input({ pointer: { ...to, pressX: ship.x, pressY: ship.y, down: true } }));
    updateGame(g, (ts += 16), input({ pointer: { ...to, pressX: ship.x, pressY: ship.y, released: true } }));
    return ts;
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

  it('goes title → level select → level 1 with Enter, and back out with Escape', () => {
    const g = createGame();
    const ctx = fakeCtx();
    updateGame(g, 0, IDLE_INPUT);
    drawGame(ctx, view, g, 0);
    expect(g.screen).toBe('title');
    updateGame(g, 16, input({ presses: ['Enter'] }));
    expect(g.screen).toBe('select');
    drawGame(ctx, view, g, 16);
    updateGame(g, 32, input({ presses: ['Enter'] }));
    expect(g.screen).toBe('play');
    expect(g.play!.levelIndex).toBe(0);
    updateGame(g, 48, input({ presses: ['Escape'] }));
    expect(g.screen).toBe('select');
    updateGame(g, 64, input({ presses: ['Escape'] }));
    expect(g.screen).toBe('title');
  });

  it('does not aim or launch on a click on the ship that never drags', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const s = g.play!.session;
    const before = { heading: s.heading, power: s.power };
    const ship = { x: s.ship.x, y: s.ship.y };
    updateGame(g, 16, input({ pointer: { ...ship, down: true, pressed: true } }));
    // A little jitter, under the drag threshold.
    updateGame(g, 32, input({ pointer: { x: ship.x + 3, y: ship.y + 2, pressX: ship.x, pressY: ship.y, released: true } }));
    expect(s.phase).toBe('aiming');
    expect({ heading: s.heading, power: s.power }).toEqual(before);
  });

  it('ignores a drag that starts away from the ship', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const s = g.play!.session;
    const before = { heading: s.heading, power: s.power };
    const far = { x: 600, y: 300 };
    const sol = LEVELS[0].solution;
    const target = pointAt(g, sol.heading, sol.power);
    updateGame(g, 16, input({ pointer: { ...far, down: true, pressed: true } }));
    updateGame(g, 32, input({ pointer: { ...target, pressX: far.x, pressY: far.y, down: true } }));
    updateGame(g, 48, input({ pointer: { ...target, pressX: far.x, pressY: far.y, released: true } }));
    expect(s.phase).toBe('aiming');
    expect({ heading: s.heading, power: s.power }).toEqual(before);
  });

  it('counts a press on the ship, a drag and a release inside one frame as a launch', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const s = g.play!.session;
    const sol = LEVELS[0].solution;
    const end = pointAt(g, sol.heading, sol.power);
    updateGame(g, 16, input({ pointer: { ...end, pressX: s.ship.x, pressY: s.ship.y, pressed: true, released: true } }));
    expect(s.phase).toBe('flying');
    expect(s.launchDv).toBeCloseTo(sol.power, 6);
  });

  it('cancels a drag with Escape without launching', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const s = g.play!.session;
    const ship = { x: s.ship.x, y: s.ship.y };
    const to = pointAt(g, 30, 120);
    updateGame(g, 16, input({ pointer: { ...ship, down: true, pressed: true } }));
    updateGame(g, 32, input({ pointer: { ...to, pressX: ship.x, pressY: ship.y, down: true } }));
    expect(g.play!.drag?.active).toBe(true);
    updateGame(g, 48, input({ presses: ['Escape'], pointer: { ...to, pressX: ship.x, pressY: ship.y, down: true } }));
    updateGame(g, 64, input({ pointer: { ...to, pressX: ship.x, pressY: ship.y, released: true } }));
    expect(g.screen).toBe('play');
    expect(s.phase).toBe('aiming');
  });

  it('shows a grab cursor over the ship only', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const s = g.play!.session;
    expect(cursorFor(g, s.ship.x, s.ship.y)).toBe('grab');
    expect(cursorFor(g, 900, -500)).toBe('default');
    updateGame(g, 16, input({ pointer: { x: s.ship.x, y: s.ship.y, down: true, pressed: true } }));
    expect(cursorFor(g, s.ship.x, s.ship.y)).toBe('grabbing');
  });

  it('does not aim or launch on a single click away from the ship', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const s = g.play!.session;
    const before = { heading: s.heading, power: s.power, fuel: s.fuel };
    // One click near the top-right corner, far from the ship: press, then release on the same spot.
    const corner = { x: 900, y: -500 };
    updateGame(g, 16, input({ pointer: { ...corner, down: true, pressed: true, released: false } }));
    updateGame(g, 32, input({ pointer: { ...corner, down: false, pressed: false, released: true } }));
    // And the same click arriving within a single frame.
    updateGame(g, 48, input({ pointer: { ...corner, down: false, pressed: true, released: true } }));
    expect(s.phase).toBe('aiming');
    expect({ heading: s.heading, power: s.power, fuel: s.fuel }).toEqual(before);
  });

  it('aims by dragging, launches on release and delivers level 1', () => {
    const g = createGame({ startLevel: 0 });
    updateGame(g, 0, IDLE_INPUT);
    const sol = LEVELS[0].solution;
    const s = g.play!.session;
    const ship = { x: s.ship.x, y: s.ship.y };
    const end = pointAt(g, sol.heading, sol.power);
    updateGame(g, 16, input({ pointer: { ...ship, down: true, pressed: true } }));
    expect(g.play!.drag).not.toBeNull();
    updateGame(g, 32, input({ pointer: { ...end, pressX: ship.x, pressY: ship.y, down: true } }));
    expect(s.heading).toBeCloseTo(sol.heading, 6);
    expect(s.power).toBeCloseTo(sol.power, 6);
    expect(g.play!.preview?.points.length).toBeGreaterThan(10);
    updateGame(g, 48, input({ pointer: { ...end, pressX: ship.x, pressY: ship.y, released: true } }));
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
    let ts = dragFromShip(g, 0, pointAt(g, sol.heading, sol.power));
    ts = frames(g, ts, 60 * 30);
    expect(g.play!.session.outcome?.reason).toBe('delivered');
    expect(g.play!.endTs).not.toBeNull();
    updateGame(g, (ts += 16), input({ presses: ['Enter'] }));
    expect(g.play!.levelIndex).toBe(1);

    // Fly level 2 straight into GOLIATH, then retry.
    const w = g.play!.session.world;
    const gi = w.sys.index.get('goliath')!;
    ts = dragFromShip(g, ts, { x: bodyX(w, 0, gi), y: bodyY(w, 0, gi) });
    expect(g.play!.session.phase).toBe('flying');
    ts = frames(g, ts, 60 * 20);
    expect(g.play!.session.outcome?.reason).not.toBe('delivered');
    updateGame(g, (ts += 16), input({ presses: ['Enter'] }));
    expect(g.play!.levelIndex).toBe(1);
    expect(g.play!.session.phase).toBe('aiming');
  });

  describe('level select and saved progress', () => {
    function fromTitleToSelect(g: Game): number {
      updateGame(g, 0, IDLE_INPUT);
      updateGame(g, 16, input({ presses: ['Enter'] }));
      expect(g.screen).toBe('select');
      return 16;
    }

    function clickCard(g: Game, ts: number, index: number): number {
      const r = selectCardRect(index);
      const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      updateGame(g, (ts += 16), input({ pointer: { ...c, down: true, pressed: true } }));
      updateGame(g, (ts += 16), input({ pointer: { ...c, released: true } }));
      return ts;
    }

    /** Flies the current level's stored solution by dragging from the ship, to the end. */
    function flySolution(g: Game, ts: number): number {
      const sol = g.play!.session.level.solution;
      ts = dragFromShip(g, ts, pointAt(g, sol.heading, sol.power));
      for (let i = 0; i < 60 * 40 && g.play!.session.phase !== 'ended'; i++) updateGame(g, (ts += 1000 / 60), IDLE_INPUT);
      return ts;
    }

    it('opens with only the first level unlocked', () => {
      const g = createGame({ storage: new MemoryStorage() });
      let ts = fromTitleToSelect(g);
      expect(g.select.index).toBe(0);
      updateGame(g, (ts += 16), input({ presses: ['ArrowRight'] }));
      expect(g.select.index).toBe(1);
      updateGame(g, (ts += 16), input({ presses: ['Enter'] }));
      expect(g.screen).toBe('select');
      ts = clickCard(g, ts, 4);
      expect(g.screen).toBe('select');
      ts = clickCard(g, ts, 0);
      expect(g.screen).toBe('play');
      expect(g.play!.levelIndex).toBe(0);
    });

    it('moves the selection with the arrow keys, wrapping round', () => {
      const g = createGame();
      let ts = fromTitleToSelect(g);
      updateGame(g, (ts += 16), input({ presses: ['ArrowLeft'] }));
      expect(g.select.index).toBe(9);
      updateGame(g, (ts += 16), input({ presses: ['ArrowDown'] }));
      expect(g.select.index).toBe(4);
      updateGame(g, (ts += 16), input({ presses: ['ArrowRight'] }));
      expect(g.select.index).toBe(5);
    });

    it('follows the pointer once it moves, not on the first frame', () => {
      const g = createGame();
      let ts = fromTitleToSelect(g);
      const r = selectCardRect(7);
      const over = { x: r.x + 10, y: r.y + 10 };
      updateGame(g, (ts += 16), input({ pointer: over }));
      expect(g.select.index).toBe(0);
      updateGame(g, (ts += 16), input({ pointer: { x: over.x + 5, y: over.y } }));
      expect(g.select.index).toBe(7);
      expect(cursorFor(g, over.x, over.y)).toBe('default'); // locked
      const first = selectCardRect(0);
      expect(cursorFor(g, first.x + 10, first.y + 10)).toBe('pointer');
    });

    it('saves a delivery with its stars, unlocks the next level and remembers it next session', () => {
      const storage = new MemoryStorage();
      const g = createGame({ storage });
      let ts = fromTitleToSelect(g);
      updateGame(g, (ts += 16), input({ presses: ['Enter'] }));
      ts = flySolution(g, ts);
      const p = g.play!;
      expect(p.session.outcome?.reason).toBe('delivered');
      expect(p.result).toEqual({ stars: 3, newBest: true, previous: undefined });
      const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
      expect(saved.levels['1'].stars).toBe(3);
      expect(saved.levels['1'].fuel).toBeCloseTo(LEVELS[0].solution.power, 3);

      // Back to the level select: flight 2 is open now.
      updateGame(g, (ts += 16), input({ presses: ['Escape'] }));
      expect(g.screen).toBe('select');
      ts = clickCard(g, ts, 1);
      expect(g.screen).toBe('play');
      expect(g.play!.levelIndex).toBe(1);

      // A new session reads it back and selects the newest open level.
      const again = createGame({ storage });
      expect(again.progress.levels['1'].stars).toBe(3);
      fromTitleToSelect(again);
      expect(again.select.index).toBe(1);
    });

    it('does not save a failed flight or a run that is no better', () => {
      const storage = new MemoryStorage();
      const g = createGame({ storage, startLevel: 0 });
      updateGame(g, 0, IDLE_INPUT);
      let ts = flySolution(g, 0);
      expect(storage.writes).toBe(1);

      // The same run again is not better: nothing written, and the old best is shown.
      updateGame(g, (ts += 16), input({ presses: ['KeyR'] }));
      ts = flySolution(g, ts);
      expect(storage.writes).toBe(1);
      expect(g.play!.result?.newBest).toBe(false);
      expect(g.play!.result?.previous?.stars).toBe(3);

      // A crash is never recorded.
      updateGame(g, (ts += 16), input({ presses: ['KeyR'] }));
      const w = g.play!.session.world;
      const planet = w.sys.index.get('aura')!; // the pickup moon's own planet
      ts = dragFromShip(g, ts, { x: bodyX(w, 0, planet), y: bodyY(w, 0, planet) });
      for (let i = 0; i < 60 * 40 && g.play!.session.phase !== 'ended'; i++) updateGame(g, (ts += 1000 / 60), IDLE_INPUT);
      expect(g.play!.session.outcome?.reason).not.toBe('delivered');
      expect(g.play!.result?.stars).toBe(0);
      expect(storage.writes).toBe(1);
    });

    it('never reads or writes saved progress in demo mode', () => {
      const storage = new MemoryStorage();
      storage.data.set(STORAGE_KEY, JSON.stringify({ version: 1, levels: { '1': { stars: 1, fuel: 200, time: 20 } } }));
      const g = createGame({ startLevel: 0, demo: { speed: 1 }, storage });
      for (let ts = 0; g.play?.demo?.state !== 'done' && ts < 60_000; ts += 1000 / 60) updateGame(g, ts, IDLE_INPUT);
      expect(g.play!.demo!.state).toBe('done');
      expect(storage.reads).toBe(0);
      expect(storage.writes).toBe(0);
      expect(g.progress.levels).toEqual({});
      // The results panel still scores the run.
      expect(g.play!.result?.stars).toBe(3);
    });
  });

  describe('ghost of the best run', () => {
    /** Flies the stored solution by dragging from the ship, drawing every frame; calls `each` per frame in flight. */
    function flyDrawn(g: Game, ts: number, each?: () => void): number {
      const ctx = fakeCtx();
      const sol = g.play!.session.level.solution;
      ts = dragFromShip(g, ts, pointAt(g, sol.heading, sol.power));
      for (let i = 0; i < 60 * 40 && g.play!.session.phase !== 'ended'; i++) {
        updateGame(g, (ts += 1000 / 60), IDLE_INPUT);
        drawGame(ctx, view, g, ts);
        each?.();
      }
      // Let the results panel play out too.
      for (let i = 0; i < 150; i++) drawGame(ctx, view, g, (ts += 1000 / 60));
      return ts;
    }

    it('has no ghost on a first flight, then replays the best run in time with the next', () => {
      const storage = new MemoryStorage();
      const g = createGame({ storage, startLevel: 0 });
      updateGame(g, 0, IDLE_INPUT);
      expect(g.play!.ghost).toBeNull();
      let ts = flyDrawn(g, 0);
      const saved = JSON.parse(storage.data.get(STORAGE_KEY)!).levels['1'];
      expect(isGhost(saved.ghost)).toBe(true);
      expect(saved.ghost.ticks).toBe(g.play!.session.tick);

      updateGame(g, (ts += 16), input({ presses: ['KeyR'] }));
      const ghost = g.play!.ghost!;
      expect(ghost).toEqual(saved.ghost);
      // Flying the same line again, the ghost stays on top of the ship the whole way.
      let worst = 0;
      let frames = 0;
      flyDrawn(g, ts, () => {
        const s = g.play!.session;
        const p = ghostAt(ghost, s.tick);
        worst = Math.max(worst, Math.hypot(p.x - s.ship.x, p.y - s.ship.y));
        frames++;
      });
      expect(frames).toBeGreaterThan(600);
      expect(worst).toBeLessThan(1);
    });

    it('comes back after a reload', () => {
      const storage = new MemoryStorage();
      const g = createGame({ storage, startLevel: 0 });
      updateGame(g, 0, IDLE_INPUT);
      flyDrawn(g, 0);
      const reloaded = createGame({ storage, startLevel: 0 });
      updateGame(reloaded, 0, IDLE_INPUT);
      expect(reloaded.play!.ghost).toEqual(g.progress.levels['1'].ghost);
    });

    it('loads a save from before ghosts, plays without one, and adds one when that best is beaten', () => {
      const storage = new MemoryStorage();
      storage.data.set(STORAGE_KEY, '{"version":1,"levels":{"1":{"stars":1,"fuel":240,"time":25}}}');
      const g = createGame({ storage, startLevel: 0 });
      updateGame(g, 0, IDLE_INPUT);
      expect(g.progress.levels['1']).toEqual({ stars: 1, fuel: 240, time: 25 });
      expect(g.play!.ghost).toBeNull();
      const ts = flyDrawn(g, 0);
      expect(g.play!.result?.newBest).toBe(true);
      updateGame(g, ts + 16, input({ presses: ['KeyR'] }));
      expect(isGhost(g.play!.ghost)).toBe(true);
    });

    it('never shows a saved ghost in demo mode', () => {
      const storage = new MemoryStorage();
      const normal = createGame({ storage, startLevel: 0 });
      updateGame(normal, 0, IDLE_INPUT);
      flyDrawn(normal, 0);
      expect(isGhost(normal.progress.levels['1'].ghost)).toBe(true);

      const reads = storage.reads;
      const demo = createGame({ startLevel: 0, demo: { speed: 1 }, storage });
      const ctx = fakeCtx();
      for (let ts = 0; demo.play?.demo?.state !== 'done' && ts < 60_000; ts += 1000 / 60) {
        updateGame(demo, ts, IDLE_INPUT);
        drawGame(ctx, view, demo, ts);
        expect(demo.play!.ghost).toBeNull();
      }
      expect(demo.play!.demo!.state).toBe('done');
      expect(storage.reads).toBe(reads);
    });
  });
});
