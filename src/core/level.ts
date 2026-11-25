import type { BodyDef } from './bodies.ts';

/** A burn held for ticks [start, end) after launch. dir 1 is prograde, -1 retrograde. */
export interface Burn {
  start: number;
  end: number;
  dir: 1 | -1;
}

/** Everything a player does in a flight: one launch, then any burns. */
export interface Solution {
  /** Launch heading in degrees, compass-style (0 = up the screen, clockwise). */
  heading: number;
  /** Launch Δv. */
  power: number;
  burns: Burn[];
}

export interface Level {
  id: number;
  name: string;
  /** One line telling the player what this level is about. */
  brief: string;
  bodies: BodyDef[];
  /** Moon the parcel is collected from; the ship launches off its surface. */
  pickup: string;
  /** Moon the parcel goes to. */
  target: string;
  /** Total Δv for the flight: the launch plus every burn. */
  fuel: number;
  /** Largest single launch allowed. */
  maxLaunch: number;
  /** Seconds of flight before the delivery window closes. */
  timeLimit: number;
  /** Reaching this distance from the target's centre delivers the parcel. */
  deliveryRadius: number;
  /** A known flight that delivers within the fuel and time limits. Verified by the tests. */
  solution: Solution;
}
