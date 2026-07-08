// backend/couponEngine.js
// Pure backend math – AI never touches amounts.
'use strict';

const UNIT_PRICE = 1.25; // TL per kolon for Istanbul 6li Ganyan

/**
 * Calculate kolon count from legs array.
 * legs: array of 6 arrays, each containing horse numbers selected for that leg.
 */
function kolonCount(legs) {
  if (!Array.isArray(legs) || legs.length !== 6)
    throw new Error('6 ayak gereklidir');
  return legs.reduce((acc, leg) => {
    if (!Array.isArray(leg) || leg.length === 0)
      throw new Error('Her ayakta en az 1 at olmalıdır');
    return acc * leg.length;
  }, 1);
}

/**
 * totalAmount = kolonCount * unitPrice * misli
 */
function totalAmount(legs, misli = 1) {
  return kolonCount(legs) * UNIT_PRICE * misli;
}

/**
 * Verify that legs produce exactly the requested budget.
 * Returns { ok, kolonCount, total }
 */
function verify(legs, misli, budget) {
  const kc = kolonCount(legs);
  const total = parseFloat((kc * UNIT_PRICE * misli).toFixed(2));
  return {
    ok: total === budget,
    kolonCount: kc,
    total,
  };
}

/**
 * Given AI ranking (sorted best-to-worst) and a target budget+misli,
 * build legs so that total_amount === budget exactly.
 *
 * Strategy:
 *  - Normal coupon  (misli=1): strongest 2 horses as banko (1 choice each)
 *    distribute remaining kolons across 4 legs.
 *  - 2 Misli coupon (misli=2): only 1 banko, spread risk with alternatives.
 *
 * targetKolons = budget / (UNIT_PRICE * misli)
 * We must factor targetKolons into 6 integers ≥ 1.
 *
 * ranking: [{horse_no, prob, reason}, ...] sorted desc by prob
 */
function buildLegs(ranking, budget, misli) {
  const targetKolons = budget / (UNIT_PRICE * misli);
  if (!Number.isInteger(targetKolons))
    throw new Error(`Budget ${budget} TL misli=${misli} ile tam kolon üretilemez`);

  const horses = ranking.map(r => r.horse_no);
  if (horses.length < 6)
    throw new Error('En az 6 at gereklidir (6 ayak için)');

  // Factor targetKolons into 6 leg sizes
  const legSizes = factorize(targetKolons, 6);

  // Assign horses to legs:
  //   banko legs get [topHorse]
  //   multi legs pick from ranked list in order
  const bankos = [];
  const legs = [];

  // Sort legSizes so banko legs (size=1) come first
  const sorted = [...legSizes].sort((a, b) => a - b);

  let horseIdx = 0;
  for (const size of sorted) {
    const leg = [];
    if (size === 1 && misli === 1 && bankos.length < 2) {
      leg.push(horses[horseIdx++]);
      bankos.push(leg[0]);
    } else if (size === 1 && misli === 2 && bankos.length < 1) {
      leg.push(horses[horseIdx++]);
      bankos.push(leg[0]);
    } else {
      for (let i = 0; i < size; i++) {
        leg.push(horses[horseIdx % horses.length]);
        horseIdx++;
      }
    }
    legs.push(leg);
  }

  // Final verification
  const v = verify(legs, misli, budget);
  if (!v.ok)
    throw new Error(`Doğrulama hatası: ${v.total} TL ≠ ${budget} TL`);

  return { legs, bankos, kolonCount: v.kolonCount, totalAmount: v.total, misli, budget };
}

/**
 * Factor n into exactly `count` integers ≥ 1 whose product = n.
 * Tries small prime factors first.
 */
function factorize(n, count) {
  const result = Array(count).fill(1);
  let remaining = n;
  const primes = [2, 3, 5, 7, 11, 13];

  let slot = 0;
  for (const p of primes) {
    while (remaining % p === 0 && slot < count) {
      result[slot] *= p;
      remaining /= p;
      slot = (slot + 1) % count;
    }
  }
  // absorb leftover into first slot
  if (remaining > 1) result[0] *= remaining;

  return result;
}

/**
 * Generate all 4 coupon variants for a given race analysis.
 * Returns array of 4 coupon objects.
 */
function generateAll(ranking) {
  const variants = [
    { budget: 1500, misli: 1 },
    { budget: 3000, misli: 1 },
    { budget: 1500, misli: 2 },
    { budget: 3000, misli: 2 },
  ];

  return variants.map(v => {
    try {
      return { ...v, ...buildLegs(ranking, v.budget, v.misli), error: null };
    } catch (e) {
      return { ...v, error: e.message };
    }
  });
}

module.exports = { kolonCount, totalAmount, verify, buildLegs, generateAll };
