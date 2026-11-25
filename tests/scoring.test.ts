import { describe, expect, it } from 'vitest';
import { starsFor } from '../src/core/scoring.ts';
import { testLevel } from './helpers.ts';

describe('stars', () => {
  const level = testLevel({ par: { fuel: 100, time: 10 } });

  it('gives none for a failed flight, however cheap', () => {
    expect(starsFor(level, false, 10, 1)).toBe(0);
  });

  it('gives one for a delivery over the Δv par', () => {
    expect(starsFor(level, true, 100.01, 1)).toBe(1);
  });

  it('gives two for a delivery on the Δv par but over the time par', () => {
    expect(starsFor(level, true, 100, 10.01)).toBe(2);
  });

  it('gives three for a delivery on both pars, inclusive', () => {
    expect(starsFor(level, true, 100, 10)).toBe(3);
    expect(starsFor(level, true, 50, 4)).toBe(3);
  });

  it('needs the Δv par for the time to count', () => {
    expect(starsFor(level, true, 150, 2)).toBe(1);
  });
});
