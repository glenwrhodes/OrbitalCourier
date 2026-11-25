import { DT, MIN_LAUNCH_POWER, THRUST_ACCEL, TRAIL_EVERY } from './constants.ts';
import type { Level, Solution } from './level.ts';
import type { Ship } from './physics.ts';
import { thrustAt } from './solution.ts';
import { clamp, normalizeHeading } from './vec.ts';
import { advance, createWorld, launchState, type StepOut, type World } from './world.ts';

export type Phase = 'aiming' | 'flying' | 'ended';
export type EndReason = 'delivered' | 'impact' | 'out-of-bounds' | 'timeout';

export interface Outcome {
  reason: EndReason;
  /** Body hit or reached, or null. */
  bodyId: string | null;
  /** Ticks since launch when the flight ended. */
  tick: number;
  x: number;
  y: number;
}

export interface Session {
  readonly level: Level;
  readonly world: World;
  phase: Phase;
  /** Current aim while aiming; the launch values once flying. */
  heading: number;
  power: number;
  /** Ship state. While aiming this is where the ship would launch from. */
  ship: Ship;
  /** Ticks since launch. Bodies are at world time tick × DT. */
  tick: number;
  /** Δv left. Never negative. */
  fuel: number;
  launchDv: number;
  burnDv: number;
  /** Thrust actually applied on the latest step: 1 prograde, -1 retrograde, 0 none. */
  thrust: -1 | 0 | 1;
  /** Flown path as [x, y, x, y, ...], one point every TRAIL_EVERY ticks. */
  trail: number[];
  outcome: Outcome | null;
}

const DV_PER_TICK = THRUST_ACCEL * DT;

export function createSession(level: Level, world: World = createWorld(level)): Session {
  const heading = 90;
  const power = 0;
  return {
    level,
    world,
    phase: 'aiming',
    heading,
    power,
    ship: launchState(world, heading, power),
    tick: 0,
    fuel: level.fuel,
    launchDv: 0,
    burnDv: 0,
    thrust: 0,
    trail: [],
    outcome: null,
  };
}

/** Largest launch the player can choose right now. */
export function maxLaunchPower(s: Session): number {
  return Math.min(s.level.maxLaunch, s.fuel);
}

/** Sets the launch aim. Heading wraps into [0, 360); power is clamped to what is allowed. */
export function setAim(s: Session, heading: number, power: number): void {
  if (s.phase !== 'aiming') return;
  s.heading = normalizeHeading(heading);
  s.power = clamp(power, 0, maxLaunchPower(s));
  s.ship = launchState(s.world, s.heading, s.power);
}

export function canLaunch(s: Session): boolean {
  return s.phase === 'aiming' && s.power >= MIN_LAUNCH_POWER;
}

export function launch(s: Session): boolean {
  if (!canLaunch(s)) return false;
  s.ship = launchState(s.world, s.heading, s.power);
  s.fuel = Math.max(0, s.fuel - s.power);
  s.launchDv = s.power;
  s.phase = 'flying';
  s.tick = 0;
  s.trail = [s.ship.x, s.ship.y];
  return true;
}

const stepOut: StepOut = { event: 'none', body: -1 };

/** Advances a flight by one tick. thrust 1 burns prograde, -1 retrograde. */
export function stepSession(s: Session, thrust: -1 | 0 | 1): void {
  if (s.phase !== 'flying') return;
  const ship = s.ship;
  let tx = 0;
  let ty = 0;
  let applied: -1 | 0 | 1 = 0;
  if (thrust !== 0 && s.fuel > 0) {
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > 1e-9) {
      const dv = Math.min(DV_PER_TICK, s.fuel);
      const k = (thrust * dv) / DT / speed;
      tx = ship.vx * k;
      ty = ship.vy * k;
      s.fuel = s.fuel - dv < 1e-9 ? 0 : s.fuel - dv;
      s.burnDv += dv;
      applied = thrust;
    }
  }
  s.thrust = applied;

  advance(s.world, ship, s.tick, tx, ty, stepOut);
  s.tick++;
  if (s.tick % TRAIL_EVERY === 0) s.trail.push(ship.x, ship.y);

  if (stepOut.event !== 'none') {
    end(s, stepOut.event, stepOut.body >= 0 ? s.world.sys.defs[stepOut.body].id : null);
  } else if (s.tick >= s.world.maxTick) {
    end(s, 'timeout', null);
  }
}

function end(s: Session, reason: EndReason, bodyId: string | null): void {
  if (s.tick % TRAIL_EVERY !== 0) s.trail.push(s.ship.x, s.ship.y);
  s.phase = 'ended';
  s.thrust = 0;
  s.outcome = { reason, bodyId, tick: s.tick, x: s.ship.x, y: s.ship.y };
}

export function fuelUsed(s: Session): number {
  return s.launchDv + s.burnDv;
}

export function flightSeconds(s: Session): number {
  return s.tick * DT;
}

/** Flies a stored solution to the end and returns the finished session. */
export function runSolution(level: Level, solution: Solution = level.solution, world?: World): Session {
  const s = createSession(level, world);
  setAim(s, solution.heading, solution.power);
  if (!launch(s)) return s;
  while (s.phase === 'flying') stepSession(s, thrustAt(solution, s.tick));
  return s;
}
