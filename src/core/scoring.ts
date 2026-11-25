import type { Level } from './level.ts';
import { flightSeconds, fuelUsed, type Session } from './sim.ts';

export type Stars = 0 | 1 | 2 | 3;

/**
 * Stars for a delivery:
 *   1 star:  the parcel was delivered
 *   2 stars: and the flight used no more Δv than the level's par
 *   3 stars: and also arrived within the par time
 */
export function starsFor(level: Level, delivered: boolean, dvUsed: number, seconds: number): Stars {
  if (!delivered) return 0;
  if (dvUsed > level.par.fuel) return 1;
  if (seconds > level.par.time) return 2;
  return 3;
}

export function sessionStars(s: Session): Stars {
  return starsFor(s.level, s.outcome?.reason === 'delivered', fuelUsed(s), flightSeconds(s));
}
