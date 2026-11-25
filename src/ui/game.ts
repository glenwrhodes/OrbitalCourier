// Game state and per-frame update. No DOM access here: main.ts feeds in
// requestAnimationFrame timestamps and an input snapshot, so the whole game
// can be driven from tests. All timing comes from those timestamps.
import { LAUNCH_CLEARANCE, MIN_LAUNCH_POWER, PREVIEW_SECONDS, TICK_RATE } from '../core/constants.ts';
import { LEVELS } from '../core/levels.ts';
import { predict, type Prediction } from '../core/predict.ts';
import { emptyProgress, isBetter, isUnlocked, loadProgress, recordRun, saveProgress, type LevelRecord, type Progress, type StorageLike } from '../core/progress.ts';
import { sessionStars, type Stars } from '../core/scoring.ts';
import { canLaunch, createSession, flightSeconds, fuelUsed, launch, maxLaunchPower, setAim, stepSession, type Outcome, type Session } from '../core/sim.ts';
import { thrustAt } from '../core/solution.ts';
import { dirToHeading } from '../core/vec.ts';
import { bodyX, bodyY, createWorld, type World } from '../core/world.ts';
import { SELECT_COLS, selectCardAt } from '../render/layout.ts';
import { DEMO_LAUNCH_MS, DEMO_TIMING, demoAim, demoMsForTick, demoTick, type DemoState } from './demo.ts';

export interface PointerFrame {
  /** Pointer position now, in world coordinates. */
  x: number;
  y: number;
  /** Where the latest press landed, in world coordinates. */
  pressX: number;
  pressY: number;
  down: boolean;
  /** A press happened since the last frame. */
  pressed: boolean;
  /** A release happened since the last frame. */
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
  pointer: { x: 0, y: 0, pressX: 0, pressY: 0, down: false, pressed: false, released: false },
};

export interface GameOptions {
  /** 0-based level to open straight into, skipping the title. */
  startLevel?: number;
  /** Play the level's stored solution instead of taking input. Never records progress. */
  demo?: { speed: number };
  onDemoState?: (state: DemoState, outcome: Outcome | null) => void;
  /** Where progress is saved (localStorage in the browser). Omit or null to keep nothing. */
  storage?: StorageLike | null;
}

export type Warp = 1 | 2 | 4;

/** A press on the ship that may become an aiming drag. */
export interface Drag {
  startX: number;
  startY: number;
  /** Becomes true once the pointer has moved far enough to count as a drag. */
  active: boolean;
}

export interface FlightResult {
  stars: Stars;
  /** This run beat the saved best (or there was none). */
  newBest: boolean;
  /** Best run on this level before this flight. */
  previous: LevelRecord | undefined;
}

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
  drag: Drag | null;
  preview: Prediction | null;
  previewKey: string;
  demo: { speed: number; state: DemoState } | null;
  result: FlightResult | null;
}

export interface LevelSelect {
  index: number;
  /** Last pointer position seen, so a hover only moves the selection when the pointer moves. */
  pointerX: number;
  pointerY: number;
  /** Card the current press started on, or -1. */
  pressedCard: number;
}

export interface Game {
  screen: 'title' | 'select' | 'play';
  play: Play | null;
  select: LevelSelect;
  /** Timestamp the current screen opened. */
  screenTs: number;
  lastTs: number | null;
  progress: Progress;
  readonly storage: StorageLike | null;
  readonly options: GameOptions;
  readonly worlds: Map<number, World>;
}

export const PREVIEW_TICKS = PREVIEW_SECONDS * TICK_RATE;
/** Longest frame gap the live simulation will catch up on (e.g. after a background tab). */
const MAX_FRAME_MS = 100;
/** A press within this distance of the pickup moon's surface grabs the ship. */
export const GRAB_MARGIN = 36;
/** The pointer must move this far from the press before it counts as a drag. */
export const DRAG_THRESHOLD = 8;

export function createGame(options: GameOptions = {}): Game {
  // Demo runs neither read nor write saved progress, so a recording is the same on every machine.
  const storage = options.demo ? null : (options.storage ?? null);
  const progress = storage ? loadProgress(storage, LEVELS) : emptyProgress();
  return {
    screen: 'title',
    play: null,
    select: { index: lastUnlocked(progress), pointerX: NaN, pointerY: NaN, pressedCard: -1 },
    screenTs: 0,
    lastTs: null,
    progress,
    storage,
    options,
    worlds: new Map(),
  };
}

function lastUnlocked(progress: Progress): number {
  let i = 0;
  while (i + 1 < LEVELS.length && isUnlocked(progress, LEVELS, i + 1)) i++;
  return i;
}

function worldFor(g: Game, index: number): World {
  let w = g.worlds.get(index);
  if (!w) {
    w = createWorld(LEVELS[index]);
    g.worlds.set(index, w);
  }
  return w;
}

export function openTitle(g: Game, ts: number): void {
  g.screen = 'title';
  g.play = null;
  g.screenTs = ts;
}

export function openSelect(g: Game, ts: number, index = g.select.index): void {
  g.screen = 'select';
  g.play = null;
  g.screenTs = ts;
  g.select.index = Math.max(0, Math.min(LEVELS.length - 1, index));
  g.select.pressedCard = -1;
  g.select.pointerX = NaN;
  g.select.pointerY = NaN;
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
  g.screenTs = ts;
  g.select.index = index;
  g.play = {
    levelIndex: index,
    session,
    startTs: ts,
    launchTs: null,
    endTs: null,
    simMs: 0,
    warp: 1,
    paused: false,
    drag: null,
    preview: null,
    previewKey: '',
    demo,
    result: null,
  };
  if (demo) updateDemo(g.play, ts);
  refreshPreview(g.play);
  if (demo) g.options.onDemoState?.(demo.state, null);
}

export function updateGame(g: Game, ts: number, input: InputFrame): void {
  const dt = g.lastTs === null ? 0 : Math.max(0, ts - g.lastTs);
  g.lastTs = ts;

  if (g.options.startLevel !== undefined) {
    const i = g.options.startLevel;
    g.options.startLevel = undefined;
    startLevel(g, i, ts);
    return;
  }
  if (g.screen === 'title' || (g.screen === 'play' && !g.play)) {
    if (input.presses.some(isConfirm) || input.pointer.released) openSelect(g, ts);
    return;
  }
  if (g.screen === 'select') {
    updateSelect(g, ts, input);
    return;
  }

  const p = g.play!;
  if (p.demo) {
    const before = p.demo.state;
    updateDemo(p, ts);
    if (p.session.phase === 'ended' && !p.result) finishFlight(g, p);
    refreshPreview(p);
    if (p.demo.state !== before) g.options.onDemoState?.(p.demo.state, p.session.outcome);
    return;
  }

  if (handleKeys(g, p, ts, input)) return;
  const s = p.session;

  if (s.phase === 'aiming') {
    updateAimDrag(p, ts, input.pointer);
  } else if (s.phase === 'flying' && p.launchTs !== ts) {
    // (Skipped on the launch frame: time before the launch is not flight time.)
    if (!p.paused) p.simMs += Math.min(dt, MAX_FRAME_MS) * p.warp;
    const targetTick = Math.floor((p.simMs * TICK_RATE) / 1000);
    const thrust = thrustFromKeys(input.held);
    while (s.phase === 'flying' && s.tick < targetTick) stepSession(s, thrust);
    if (p.paused) s.thrust = 0;
  }

  if (s.phase === 'ended' && p.endTs === null) p.endTs = ts;
  if (s.phase === 'ended' && !p.result) finishFlight(g, p);
  refreshPreview(p);
}

function isConfirm(code: string): boolean {
  return code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
}

/** Whether a press at (x, y) lands on or near the ship sitting on its pickup moon. */
export function canGrabShip(s: Session, x: number, y: number): boolean {
  if (s.phase !== 'aiming') return false;
  const w = s.world;
  const near = Math.hypot(x - bodyX(w, 0, w.pickup), y - bodyY(w, 0, w.pickup)) <= w.sys.radius[w.pickup] + GRAB_MARGIN;
  return near || Math.hypot(x - s.ship.x, y - s.ship.y) <= GRAB_MARGIN;
}

/**
 * Aiming with the pointer: a press must land on or near the ship. Moving
 * past DRAG_THRESHOLD turns it into a drag that sets the aim; releasing a
 * drag launches. A click that never dragged changes nothing.
 */
function updateAimDrag(p: Play, ts: number, ptr: PointerFrame): void {
  const s = p.session;
  if (ptr.pressed) p.drag = canGrabShip(s, ptr.pressX, ptr.pressY) ? { startX: ptr.pressX, startY: ptr.pressY, active: false } : null;
  if (!p.drag) return;
  if (!p.drag.active && Math.hypot(ptr.x - p.drag.startX, ptr.y - p.drag.startY) >= DRAG_THRESHOLD) p.drag.active = true;
  if (p.drag.active) aimAtPoint(s, ptr.x, ptr.y);
  if (ptr.released || !ptr.down) {
    const dragged = p.drag.active;
    p.drag = null;
    if (dragged) tryLaunch(p, ts);
  }
}

/** CSS cursor for the pointer at (x, y): shows where a press will do something. */
export function cursorFor(g: Game, x: number, y: number): string {
  if (g.screen === 'select') {
    const i = selectCardAt(x, y, LEVELS.length);
    return i >= 0 && isUnlocked(g.progress, LEVELS, i) ? 'pointer' : 'default';
  }
  const p = g.play;
  if (g.screen === 'play' && p && !p.demo) {
    if (p.drag) return 'grabbing';
    if (canGrabShip(p.session, x, y)) return 'grab';
  }
  return 'default';
}

function updateSelect(g: Game, ts: number, input: InputFrame): void {
  const sel = g.select;
  const n = LEVELS.length;
  for (const code of input.presses) {
    if (code === 'Escape') {
      openTitle(g, ts);
      return;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') sel.index = (sel.index + n - 1) % n;
    else if (code === 'ArrowRight' || code === 'KeyD') sel.index = (sel.index + 1) % n;
    else if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS') sel.index = (sel.index + SELECT_COLS) % n;
    else if (isConfirm(code) && isUnlocked(g.progress, LEVELS, sel.index)) {
      startLevel(g, sel.index, ts);
      return;
    }
  }
  const ptr = input.pointer;
  const hover = selectCardAt(ptr.x, ptr.y, n);
  // The first frame on this screen only notes where the pointer is.
  const moved = !Number.isNaN(sel.pointerX) && (ptr.x !== sel.pointerX || ptr.y !== sel.pointerY);
  if (moved && hover >= 0) sel.index = hover;
  sel.pointerX = ptr.x;
  sel.pointerY = ptr.y;
  if (ptr.pressed) sel.pressedCard = selectCardAt(ptr.pressX, ptr.pressY, n);
  if (ptr.released) {
    const card = sel.pressedCard;
    sel.pressedCard = -1;
    if (card >= 0 && card === hover && isUnlocked(g.progress, LEVELS, card)) startLevel(g, card, ts);
  }
}

/** Returns true when the play state was replaced (restart, next level, level select). */
function handleKeys(g: Game, p: Play, ts: number, input: InputFrame): boolean {
  const s = p.session;
  for (const code of input.presses) {
    if (code === 'Escape') {
      if (p.drag) {
        p.drag = null;
        continue;
      }
      openSelect(g, ts, p.levelIndex);
      return true;
    }
    if (code === 'KeyR') {
      startLevel(g, p.levelIndex, ts);
      return true;
    }
    if (s.phase === 'ended') {
      if (isConfirm(code) || code === 'KeyN') {
        const delivered = s.outcome?.reason === 'delivered';
        if (delivered && p.levelIndex + 1 < LEVELS.length) startLevel(g, p.levelIndex + 1, ts);
        else if (delivered) openSelect(g, ts, p.levelIndex);
        else startLevel(g, p.levelIndex, ts);
        return true;
      }
    } else if (s.phase === 'aiming') {
      const fine = input.shift;
      if (code === 'ArrowLeft' || code === 'KeyA') setAim(s, s.heading - (fine ? 0.1 : 1), s.power);
      else if (code === 'ArrowRight' || code === 'KeyD') setAim(s, s.heading + (fine ? 0.1 : 1), s.power);
      else if (code === 'ArrowUp' || code === 'KeyW') setAim(s, s.heading, s.power + (fine ? 0.5 : 5));
      else if (code === 'ArrowDown' || code === 'KeyS') setAim(s, s.heading, s.power - (fine ? 0.5 : 5));
      else if (isConfirm(code)) tryLaunch(p, ts);
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

/** Scores a finished flight and, outside demo mode, saves it if it is a new best. */
function finishFlight(g: Game, p: Play): void {
  const s = p.session;
  const level = s.level;
  const run = { stars: sessionStars(s), fuel: fuelUsed(s), time: flightSeconds(s) };
  const previous = g.progress.levels[String(level.id)];
  if (p.demo) {
    p.result = { stars: run.stars, newBest: run.stars > 0 && isBetter(run, previous), previous };
    return;
  }
  const recorded = recordRun(g.progress, level.id, run);
  if (recorded.newBest) {
    g.progress = recorded.progress;
    saveProgress(g.storage, g.progress);
  }
  p.result = { stars: run.stars, newBest: recorded.newBest, previous };
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
