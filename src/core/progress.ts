// Saved progress: the best run on each level, kept in localStorage (or any
// object with the same two methods). Loading never throws: missing, corrupt
// or unreadable data gives a fresh start, and invalid entries are dropped.
import type { Level } from './level.ts';
import type { Stars } from './scoring.ts';

export const STORAGE_KEY = 'orbital-courier:v1';
const VERSION = 1;

/** The parts of the Web Storage API progress needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Best run on a level. Only deliveries are recorded, so stars is at least 1. */
export interface LevelRecord {
  stars: 1 | 2 | 3;
  /** Δv used on that run. */
  fuel: number;
  /** Flight time of that run, in seconds. */
  time: number;
}

export interface Progress {
  version: typeof VERSION;
  /** Keyed by level id. */
  levels: Record<string, LevelRecord>;
}

export interface RunResult {
  stars: Stars;
  fuel: number;
  time: number;
}

export function emptyProgress(): Progress {
  return { version: VERSION, levels: {} };
}

export function loadProgress(storage: StorageLike | null, levels: readonly Level[]): Progress {
  if (!storage) return emptyProgress();
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return emptyProgress();
  }
  if (!raw) return emptyProgress();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyProgress();
  }
  if (!isObject(data) || data.version !== VERSION || !isObject(data.levels)) return emptyProgress();
  const progress = emptyProgress();
  const known = new Set(levels.map((l) => String(l.id)));
  for (const [id, rec] of Object.entries(data.levels)) {
    if (known.has(id) && isRecord(rec)) progress.levels[id] = { stars: rec.stars, fuel: rec.fuel, time: rec.time };
  }
  return progress;
}

/** Writes progress; returns false if storage refused (full, private mode, disabled). */
export function saveProgress(storage: StorageLike | null, progress: Progress): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

/** Whether run a beats run b: more stars, then less Δv, then less time. */
export function isBetter(a: RunResult | LevelRecord, b: RunResult | LevelRecord | undefined): boolean {
  if (!b) return true;
  if (a.stars !== b.stars) return a.stars > b.stars;
  if (a.fuel !== b.fuel) return a.fuel < b.fuel;
  return a.time < b.time;
}

/**
 * Records a finished flight. Returns the updated progress (a new object, the
 * input is not changed) and whether this run became the level's best.
 * Failed flights (0 stars) change nothing.
 */
export function recordRun(progress: Progress, levelId: number, run: RunResult): { progress: Progress; newBest: boolean } {
  if (run.stars === 0) return { progress, newBest: false };
  const key = String(levelId);
  const previous = progress.levels[key];
  if (!isBetter(run, previous)) return { progress, newBest: false };
  return {
    progress: { ...progress, levels: { ...progress.levels, [key]: { stars: run.stars, fuel: run.fuel, time: run.time } } },
    newBest: true,
  };
}

/** The first level is always open; each later one opens once the one before it is delivered. */
export function isUnlocked(progress: Progress, levels: readonly Level[], index: number): boolean {
  if (index <= 0) return true;
  if (index >= levels.length) return false;
  return String(levels[index - 1].id) in progress.levels;
}

export function totalStars(progress: Progress): number {
  return Object.values(progress.levels).reduce((n, r) => n + r.stars, 0);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isRecord(v: unknown): v is LevelRecord {
  if (!isObject(v)) return false;
  const { stars, fuel, time } = v;
  return (
    (stars === 1 || stars === 2 || stars === 3) &&
    typeof fuel === 'number' &&
    Number.isFinite(fuel) &&
    fuel >= 0 &&
    typeof time === 'number' &&
    Number.isFinite(time) &&
    time >= 0
  );
}
