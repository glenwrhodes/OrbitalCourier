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
    par: { fuel: 150, time: 10 },
    solution: { heading: 0, power: 100, burns: [] },
    ...overrides,
  };
}

/** In-memory stand-in for localStorage that counts how it is used. */
export class MemoryStorage {
  readonly data = new Map<string, string>();
  reads = 0;
  writes = 0;
  getItem(key: string): string | null {
    this.reads++;
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    this.data.set(key, value);
  }
}

export function emptySpace(extra: BodyDef[] = []): BodyDef[] {
  return [
    { id: 'a', name: 'A', kind: 'moon', radius: 10, mu: 0, pos: { x: -500, y: 0 } },
    { id: 'b', name: 'B', kind: 'moon', radius: 10, mu: 0, pos: { x: 500, y: 300 } },
    ...extra,
  ];
}
