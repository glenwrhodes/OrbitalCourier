// Game state and per-frame update. No DOM access here: main.ts feeds in
// requestAnimationFrame timestamps and an input snapshot, so the whole game
// can be driven from tests. All timing comes from those timestamps.
import { LAUNCH_CLEARANCE, MIN_LAUNCH_POWER, PREVIEW_SECONDS, TICK_RATE } from '../core/constants.ts';
import { LEVELS } from '../core/levels.ts';
import { predict, type Prediction } from '../core/predict.ts';
import { canLaunch, createSession, launch, maxLaunchPower, setAim, stepSession, type Outcome, type Session } from '../core/sim.ts';
import { thrustAt } from '../core/solution.ts';
import { dirToHeading } from '../core/vec.ts';
import { bodyX, bodyY, createWorld, type World } from '../core/world.ts';
import { DEMO_LAUNCH_MS, DEMO_TIMING, demoAim, demoMsForTick, demoTick, type DemoState } from './demo.ts';

export interface PointerFrame {
  /** World coordinates. */
  x: number;
  y: number;
  down: boolean;
  pressed: boolean;
  released: boolean;
}

export interface InputFrame {
  /** KeyboardEvent.code of every key press since the last frame, including auto-repeats. */
  presses: string[];
  held: ReadonlySet<string>;
  shift: boolean;
  pointer: PointerFrame;
}

export const IDLE_INPUT: InputFrame = {
  presses: [],
  held: new Set(),
  shift: false,
  pointer: { x: 0, y: 0, down: false, pressed: false, released: false },
};

export interface GameOptions {
  /** 0-based level to open straight into, skipping the title. */
  startLevel?: number;
  /** Play the level's stored solution instead of taking input. */
  demo?: { speed: number };
  onDemoState?: (state: DemoState, outcome: Outcome | null) => void;
}

export type Warp = 1 | 2 | 4;

export interface Play {
  levelIndex: number;
  session: Session;
  /** Timestamp the level (re)started. */
  startTs: number;
  launchTs: number | null;
  /** Timestamp the flight ended (for effects and the results panel). */
  endTs: number | null;
  /** Simulated milliseconds since launch, with warp applied (live play). */
  simMs: number;
  warp: Warp;
  paused: boolean;
  dragging: boolean;
  preview: Prediction | null;
  previewKey: string;
  demo: { speed: number; state: DemoState } | null;
}

export interface Game {
  screen: 'title' | 'play';
  play: Play | null;
  titleTs: number;
  lastTs: number | null;
  readonly options: GameOptions;
  readonly worlds: Map<number, World>;
}

export const PREVIEW_TICKS = PREVIEW_SECONDS * TICK_RATE;
/** Longest frame gap the live simulation will catch up on (e.g. after a background tab). */
const MAX_FRAME_MS = 100;

export function createGame(options: GameOptions = {}): Game {
  return { screen: 'title', play: null, titleTs: 0, lastTs: null, options, worlds: new Map() };
}

function worldFor(g: Game, index: number): World {
  let w = g.worlds.get(index);
  if (!w) {
    w = createWorld(LEVELS[index]);
    g.worlds.set(index, w);
  }
  return w;
}

export function startLevel(g: Game, index: number, ts: number): void {
  const level = LEVELS[index];
  const world = worldFor(g, index);
  const session = createSession(level, world);
  // Start aimed roughly at the target so the preview is visible straight away.
  const px = bodyX(world, 0, world.pickup);
  const py = bodyY(world, 0, world.pickup);
  const heading = dirToHeading(bodyX(world, 0, world.target) - px, bodyY(world, 0, world.target) - py);
  setAim(session, heading, Math.round(maxLaunchPower(session) * 0.4));
  const demo = g.options.demo ? { speed: g.options.demo.speed, state: 'intro' as DemoState } : null;
  g.screen = 'play';
  g.play = {
    levelIndex: index,
    session,
    startTs: ts,
    launchTs: null,
    endTs: null,
    simMs: 0,
    warp: 1,
    paused: false,
    dragging: false,
    preview: null,
    previewKey: '',
    demo,
  };
  if (demo) updateDemo(g.play, ts);
  refreshPreview(g.play);
  if (demo) g.options.onDemoState?.(demo.state, null);
}

export function updateGame(g: Game, ts: number, input: InputFrame): void {
  const dt = g.lastTs === null ? 0 : Math.max(0, ts - g.lastTs);
  g.lastTs = ts;

  if (g.screen === 'title' || !g.play) {
    if (g.options.startLevel !== undefined) {
      const i = g.options.startLevel;
      g.options.startLevel = undefined;
      startLevel(g, i, ts);
      return;
    }
    if (input.presses.some((c) => c === 'Enter' || c === 'NumpadEnter' || c === 'Space') || input.pointer.released) {
      startLevel(g, 0, ts);
    }
    return;
  }

  const p = g.play;
  if (p.demo) {
    const before = p.demo.state;
    updateDemo(p, ts);
    refreshPreview(p);
    if (p.demo.state !== before) g.options.onDemoState?.(p.demo.state, p.session.outcome);
    return;
  }

  if (handleKeys(g, p, ts, input)) return;
  const s = p.session;

  if (s.phase === 'aiming') {
    if (input.pointer.pressed) p.dragging = true;
    if (p.dragging) aimAtPoint(s, input.pointer.x, input.pointer.y);
    if (p.dragging && (input.pointer.released || !input.pointer.down)) {
      p.dragging = false;
      tryLaunch(p, ts);
    }
  } else if (s.phase === 'flying' && p.launchTs !== ts) {
    // (Skipped on the launch frame: time before the launch is not flight time.)
    if (!p.paused) p.simMs += Math.min(dt, MAX_FRAME_MS) * p.warp;
    const targetTick = Math.floor((p.simMs * TICK_RATE) / 1000);
    const thrust = thrustFromKeys(input.held);
    while (s.phase === 'flying' && s.tick < targetTick) stepSession(s, thrust);
    if (p.paused) s.thrust = 0;
  }

  if (s.phase === 'ended' && p.endTs === null) p.endTs = ts;
  refreshPreview(p);
}

/** Returns true when the play state was replaced (restart, next level, title). */
function handleKeys(g: Game, p: Play, ts: number, input: InputFrame): boolean {
  const s = p.session;
  for (const code of input.presses) {
    if (code === 'Escape') {
      if (p.dragging) {
        p.dragging = false;
        continue;
      }
      g.screen = 'title';
      g.play = null;
      g.titleTs = ts;
      return true;
    }
    if (code === 'KeyR') {
      startLevel(g, p.levelIndex, ts);
      return true;
    }
    if (s.phase === 'ended') {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyN') {
        const delivered = s.outcome?.reason === 'delivered';
        if (delivered && p.levelIndex + 1 < LEVELS.length) startLevel(g, p.levelIndex + 1, ts);
        else if (delivered) {
          g.screen = 'title';
          g.play = null;
          g.titleTs = ts;
        } else startLevel(g, p.levelIndex, ts);
        return true;
      }
    } else if (s.phase === 'aiming') {
      const fine = input.shift;
      if (code === 'ArrowLeft' || code === 'KeyA') setAim(s, s.heading - (fine ? 0.1 : 1), s.power);
      else if (code === 'ArrowRight' || code === 'KeyD') setAim(s, s.heading + (fine ? 0.1 : 1), s.power);
      else if (code === 'ArrowUp' || code === 'KeyW') setAim(s, s.heading, s.power + (fine ? 0.5 : 5));
      else if (code === 'ArrowDown' || code === 'KeyS') setAim(s, s.heading, s.power - (fine ? 0.5 : 5));
      else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') tryLaunch(p, ts);
    } else if (s.phase === 'flying') {
      if (code === 'Digit1' || code === 'Numpad1') p.warp = 1;
      else if (code === 'Digit2' || code === 'Numpad2') p.warp = 2;
      else if (code === 'Digit3' || code === 'Numpad3') p.warp = 4;
      else if (code === 'KeyP') p.paused = !p.paused;
    }
  }
  return false;
}

function thrustFromKeys(held: ReadonlySet<string>): -1 | 0 | 1 {
  const pro = held.has('KeyW') || held.has('ArrowUp');
  const retro = held.has('KeyS') || held.has('ArrowDown');
  if (pro && !retro) return 1;
  if (retro && !pro) return -1;
  return 0;
}

/** Aims so the launch vector ends at (x, y): direction from the pickup moon, length = Δv. */
export function aimAtPoint(s: Session, x: number, y: number): void {
  const w = s.world;
  const mx = bodyX(w, 0, w.pickup);
  const my = bodyY(w, 0, w.pickup);
  const dx = x - mx;
  const dy = y - my;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return;
  setAim(s, dirToHeading(dx, dy), dist - (w.sys.radius[w.pickup] + LAUNCH_CLEARANCE));
}

function tryLaunch(p: Play, ts: number): void {
  if (!canLaunch(p.session)) return;
  launch(p.session);
  p.launchTs = ts;
  p.simMs = 0;
}

function updateDemo(p: Play, ts: number): void {
  const d = p.demo!;
  const s = p.session;
  const sol = s.level.solution;
  const ms = ts - p.startTs;

  if (s.phase === 'aiming') {
    const aim = demoAim(sol, ms);
    setAim(s, aim.heading, aim.power);
    d.state = ms < DEMO_TIMING.introMs ? 'intro' : 'aiming';
    if (ms >= DEMO_LAUNCH_MS) {
      setAim(s, sol.heading, sol.power);
      launch(s);
      p.launchTs = p.startTs + DEMO_LAUNCH_MS;
      d.state = 'flying';
    }
  }
  if (s.phase === 'flying') {
    const target = demoTick(ts - p.launchTs!, d.speed);
    while (s.phase === 'flying' && s.tick < target) stepSession(s, thrustAt(sol, s.tick));
  }
  if (s.phase === 'ended') {
    // The exact moment the flight ended, so effects are frame-rate independent too.
    if (p.endTs === null) p.endTs = p.launchTs! + demoMsForTick(s.outcome!.tick, d.speed);
    d.state = ts - p.endTs >= DEMO_TIMING.doneAfterMs ? 'done' : 'ended';
  }
}

function refreshPreview(p: Play): void {
  const s = p.session;
  if (s.phase === 'aiming') {
    if (s.power < MIN_LAUNCH_POWER) {
      p.preview = null;
      p.previewKey = '';
      return;
    }
    const key = `a${s.heading}|${s.power}`;
    if (key !== p.previewKey) {
      p.preview = predict(s.world, s.ship, 0, PREVIEW_TICKS);
      p.previewKey = key;
    }
  } else if (s.phase === 'flying') {
    const key = `f${s.tick}`;
    if (key !== p.previewKey) {
      p.preview = predict(s.world, s.ship, s.tick, PREVIEW_TICKS);
      p.previewKey = key;
    }
  } else {
    p.preview = null;
    p.previewKey = '';
  }
}
