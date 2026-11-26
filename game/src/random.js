// A tiny seeded random generator (mulberry32) so a seed always builds the same
// valley, rings, trees and clouds: the game is deterministic for a given seed.

/** @param {number} seed Any integer; the same seed always gives the same stream. */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + (max - min) * next();
    },
    /** An integer in [min, max]. */
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    /** Pick one entry of an array. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
  };
}
