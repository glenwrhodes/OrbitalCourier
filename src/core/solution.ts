import type { Solution } from './level.ts';

/** Thrust the solution applies on the step that starts at `tick` (ticks since launch). */
export function thrustAt(solution: Solution, tick: number): -1 | 0 | 1 {
  for (const b of solution.burns) {
    if (tick >= b.start && tick < b.end) return b.dir;
  }
  return 0;
}
