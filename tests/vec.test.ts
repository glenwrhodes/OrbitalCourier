import { describe, expect, it } from 'vitest';
import { dirToHeading, headingDelta, headingToDir, normalizeHeading, segmentOriginDistSq } from '../src/core/vec.ts';

describe('headings', () => {
  it('points 0° up the screen and turns clockwise', () => {
    const up = headingToDir(0);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
    const right = headingToDir(90);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
    const down = headingToDir(180);
    expect(down.y).toBeCloseTo(1);
  });

  it('converts a direction back to the same heading', () => {
    for (const h of [0, 12.5, 90, 181, 270, 359.5]) {
      const d = headingToDir(h);
      expect(dirToHeading(d.x, d.y)).toBeCloseTo(h, 9);
    }
  });

  it('wraps headings into [0, 360)', () => {
    expect(normalizeHeading(-10)).toBe(350);
    expect(normalizeHeading(370)).toBe(10);
    expect(normalizeHeading(360)).toBe(0);
  });

  it('measures the shortest signed turn', () => {
    expect(headingDelta(350, 10)).toBe(20);
    expect(headingDelta(10, 350)).toBe(-20);
    expect(headingDelta(0, 180)).toBe(180);
  });
});

describe('segmentOriginDistSq', () => {
  it('finds the closest point inside the segment', () => {
    expect(segmentOriginDistSq(-10, 3, 10, 3)).toBeCloseTo(9);
  });
  it('clamps to the segment ends', () => {
    expect(segmentOriginDistSq(3, 4, 10, 4)).toBeCloseTo(25);
  });
  it('handles a zero-length segment', () => {
    expect(segmentOriginDistSq(3, 4, 3, 4)).toBeCloseTo(25);
  });
});
