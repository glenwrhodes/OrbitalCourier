import type { BodyDef } from '../src/core/bodies.ts';
import type { Level } from '../src/core/level.ts';

/** A small level for tests: a pickup moon on the left, a target moon on the right, a planet between. */
export function testLevel(overrides: Partial<Level> = {}): Level {
  return {
    id: 99,
    name: 'TEST',
    brief: 'test',
    bodies: [
      { id: 'a', name: 'A', kind: 'moon', radius: 10, mu: 1e4, pos: { x: -500, y: 0 } },
      { id: 'p', name: 'P', kind: 'planet', radius: 40, mu: 2e6, pos: { x: 0, y: 0 } },
      { id: 'b', name: 'B', kind: 'moon', radius: 10, mu: 1e4, pos: { x: 500, y: 0 } },
    ],
    pickup: 'a',
    target: 'b',
    fuel: 300,
    maxLaunch: 250,
    timeLimit: 20,
    deliveryRadius: 30,
    solution: { heading: 0, power: 100, burns: [] },
    ...overrides,
  };
}

export function emptySpace(extra: BodyDef[] = []): BodyDef[] {
  return [
    { id: 'a', name: 'A', kind: 'moon', radius: 10, mu: 0, pos: { x: -500, y: 0 } },
    { id: 'b', name: 'B', kind: 'moon', radius: 10, mu: 0, pos: { x: 500, y: 300 } },
    ...extra,
  ];
}
