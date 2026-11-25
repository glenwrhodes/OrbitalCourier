// Demo mode (?level=N&demo=solution): plays a level's stored solution through
// the normal game and renderer. Everything here is a pure function of the
// milliseconds since the level started (taken from requestAnimationFrame
// timestamps), so a recording looks identical at any frame rate.
import { MIN_LAUNCH_POWER, TICK_RATE } from '../core/constants.ts';
import type { Solution } from '../core/level.ts';
import { clamp, headingDelta, normalizeHeading } from '../core/vec.ts';

export const DEMO_TIMING = {
  /** Level card on screen, aim resting at its starting pose. */
  introMs: 1200,
  /** The aim sweeps from the starting pose onto the solution. */
  aimMs: 2800,
  /** Aim held on the solution, preview showing, before launch. */
  holdMs: 900,
  /** After the flight ends, the demo is "done" once the results panel has had this long. */
  doneAfterMs: 2200,
} as const;

export const DEMO_LAUNCH_MS = DEMO_TIMING.introMs + DEMO_TIMING.aimMs + DEMO_TIMING.holdMs;

export type DemoState = 'intro' | 'aiming' | 'flying' | 'ended' | 'done';

function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Aim at `ms` since the level started. Lands exactly on the solution once the sweep is over. */
export function demoAim(solution: Solution, ms: number): { heading: number; power: number } {
  const startHeading = solution.heading - 40;
  const startPower = Math.max(MIN_LAUNCH_POWER, solution.power * 0.45);
  if (ms >= DEMO_TIMING.introMs + DEMO_TIMING.aimMs) return { heading: solution.heading, power: solution.power };
  const u = clamp((ms - DEMO_TIMING.introMs) / DEMO_TIMING.aimMs, 0, 1);
  const e = easeInOutCubic(u);
  // A small overshoot that settles, like a hand homing in on the right line.
  const wobble = Math.sin(u * Math.PI * 2) * (1 - u) * u * 4;
  const delta = headingDelta(startHeading, solution.heading);
  return {
    heading: normalizeHeading(startHeading + delta * e + wobble * 6),
    power: startPower + (solution.power - startPower) * e + wobble * solution.power * 0.06,
  };
}

/** Flight tick the demo should have reached `msSinceLaunch` after launch. */
export function demoTick(msSinceLaunch: number, speed: number): number {
  if (msSinceLaunch < 0) return 0;
  return Math.floor((msSinceLaunch * speed * TICK_RATE) / 1000);
}

/** Wall-clock ms after launch at which a flight tick is shown. */
export function demoMsForTick(tick: number, speed: number): number {
  return (tick * 1000) / (TICK_RATE * speed);
}
