import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/core/levels.ts';
import {
  emptyProgress,
  isUnlocked,
  loadProgress,
  recordRun,
  saveProgress,
  STORAGE_KEY,
  totalStars,
  type StorageLike,
} from '../src/core/progress.ts';
import { MemoryStorage } from './helpers.ts';

function storageWith(raw: string): MemoryStorage {
  const s = new MemoryStorage();
  s.data.set(STORAGE_KEY, raw);
  return s;
}

describe('loading and saving', () => {
  it('starts empty with no storage or nothing saved', () => {
    expect(loadProgress(null, LEVELS)).toEqual(emptyProgress());
    expect(loadProgress(new MemoryStorage(), LEVELS)).toEqual(emptyProgress());
  });

  it('round-trips through storage', () => {
    const storage = new MemoryStorage();
    const { progress } = recordRun(emptyProgress(), 3, { stars: 2, fuel: 140.5, time: 12.25 });
    expect(saveProgress(storage, progress)).toBe(true);
    expect(loadProgress(storage, LEVELS)).toEqual(progress);
  });

  it('starts fresh on corrupt JSON, a wrong version or the wrong shape', () => {
    for (const raw of ['{not json', '[]', 'null', '42', '{"version":2,"levels":{}}', '{"version":1,"levels":[]}', '{"version":1}']) {
      expect(loadProgress(storageWith(raw), LEVELS), raw).toEqual(emptyProgress());
    }
  });

  it('drops invalid or unknown entries and keeps the good ones', () => {
    const raw = JSON.stringify({
      version: 1,
      levels: {
        '1': { stars: 3, fuel: 115, time: 13.1 },
        '2': { stars: 4, fuel: 100, time: 5 },
        '3': { stars: 2, fuel: -1, time: 5 },
        '4': { stars: 1, fuel: '45', time: 5 },
        '5': { stars: 1, fuel: 45 },
        '99': { stars: 3, fuel: 1, time: 1 },
        '6': null,
      },
    });
    expect(loadProgress(storageWith(raw), LEVELS).levels).toEqual({ '1': { stars: 3, fuel: 115, time: 13.1 } });
  });

  it('survives storage that throws', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadProgress(broken, LEVELS)).toEqual(emptyProgress());
    expect(saveProgress(broken, emptyProgress())).toBe(false);
  });
});

describe('recording runs', () => {
  it('ignores failed flights', () => {
    const p = emptyProgress();
    const r = recordRun(p, 1, { stars: 0, fuel: 10, time: 1 });
    expect(r.newBest).toBe(false);
    expect(r.progress).toBe(p);
  });

  it('keeps the best run: more stars, then less Δv, then less time', () => {
    let p = recordRun(emptyProgress(), 1, { stars: 1, fuel: 200, time: 20 }).progress;
    const steps: [{ stars: 1 | 2 | 3; fuel: number; time: number }, boolean][] = [
      [{ stars: 1, fuel: 210, time: 5 }, false], // more Δv, same stars
      [{ stars: 1, fuel: 190, time: 30 }, true], // less Δv wins despite the time
      [{ stars: 1, fuel: 190, time: 29 }, true], // same Δv, faster
      [{ stars: 2, fuel: 250, time: 40 }, true], // more stars beats everything
      [{ stars: 1, fuel: 10, time: 1 }, false], // fewer stars never wins
      [{ stars: 2, fuel: 250, time: 40 }, false], // an exact repeat is not better
    ];
    for (const [run, better] of steps) {
      const r = recordRun(p, 1, run);
      expect(r.newBest, JSON.stringify(run)).toBe(better);
      p = r.progress;
    }
    expect(p.levels['1']).toEqual({ stars: 2, fuel: 250, time: 40 });
  });

  it('does not change the progress it is given', () => {
    const p = emptyProgress();
    recordRun(p, 1, { stars: 3, fuel: 1, time: 1 });
    expect(p.levels).toEqual({});
  });
});

describe('unlocking and totals', () => {
  it('opens each level once the one before it is delivered', () => {
    let p = emptyProgress();
    expect(isUnlocked(p, LEVELS, 0)).toBe(true);
    expect(isUnlocked(p, LEVELS, 1)).toBe(false);
    p = recordRun(p, 1, { stars: 1, fuel: 200, time: 20 }).progress;
    expect(isUnlocked(p, LEVELS, 1)).toBe(true);
    expect(isUnlocked(p, LEVELS, 2)).toBe(false);
    expect(isUnlocked(p, LEVELS, LEVELS.length)).toBe(false);
  });

  it('adds up the stars', () => {
    let p = emptyProgress();
    p = recordRun(p, 1, { stars: 3, fuel: 1, time: 1 }).progress;
    p = recordRun(p, 2, { stars: 2, fuel: 1, time: 1 }).progress;
    expect(totalStars(p)).toBe(5);
  });
});
