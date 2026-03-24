import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeDraws,
  assertUniqueCards,
  calculateEquityMonteCarlo,
  calculateFutureHandDistribution,
  compareHandEvaluations,
  createCard,
  createDeck,
  evaluateBestHand,
  getRemainingDeck,
  getStreetFromBoard,
} from './index.js';

test('createCard parses rank and suit correctly', () => {
  const card = createCard('As');
  assert.equal(card.rank, 'A');
  assert.equal(card.suit, 's');
  assert.equal(card.code, 'As');
});

test('createDeck returns 52 unique cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.code)).size, 52);
});

test('assertUniqueCards throws on duplicate cards', () => {
  assert.throws(() => assertUniqueCards(['As', 'Kd', 'As']), /Duplicate card detected/);
});

test('getRemainingDeck excludes used cards', () => {
  const remaining = getRemainingDeck(['As', 'Kd', 'Qh']);
  assert.equal(remaining.length, 49);
  assert.equal(remaining.some((card) => card.code === 'As'), false);
  assert.equal(remaining.some((card) => card.code === 'Kd'), false);
  assert.equal(remaining.some((card) => card.code === 'Qh'), false);
});

test('getStreetFromBoard maps valid board sizes', () => {
  assert.equal(getStreetFromBoard([]), 'preflop');
  assert.equal(getStreetFromBoard(['As', 'Kd', 'Qh']), 'flop');
  assert.equal(getStreetFromBoard(['As', 'Kd', 'Qh', 'Jc']), 'turn');
  assert.equal(getStreetFromBoard(['As', 'Kd', 'Qh', 'Jc', 'Ts']), 'river');
});

test('getStreetFromBoard rejects invalid board sizes', () => {
  assert.throws(() => getStreetFromBoard(['As']), /Invalid board card count/);
  assert.throws(() => getStreetFromBoard(['As', 'Kd']), /Invalid board card count/);
});

test('evaluateBestHand identifies high card', () => {
  const hand = evaluateBestHand(['As', 'Kd', '9h', '7c', '3d']);
  assert.equal(hand.category, 'high-card');
});

test('evaluateBestHand identifies one pair', () => {
  const hand = evaluateBestHand(['As', 'Ad', '9h', '7c', '3d']);
  assert.equal(hand.category, 'one-pair');
});

test('evaluateBestHand identifies two pair', () => {
  const hand = evaluateBestHand(['As', 'Ad', '9h', '9c', '3d']);
  assert.equal(hand.category, 'two-pair');
});

test('evaluateBestHand identifies three of a kind', () => {
  const hand = evaluateBestHand(['As', 'Ad', 'Ah', '9c', '3d']);
  assert.equal(hand.category, 'three-of-a-kind');
});

test('evaluateBestHand identifies straight including wheel', () => {
  const hand = evaluateBestHand(['As', '2d', '3h', '4c', '5d']);
  assert.equal(hand.category, 'straight');
  assert.equal(hand.tiebreaker[0], 5);
});

test('evaluateBestHand identifies flush', () => {
  const hand = evaluateBestHand(['As', 'Js', '8s', '4s', '2s']);
  assert.equal(hand.category, 'flush');
});

test('evaluateBestHand identifies full house', () => {
  const hand = evaluateBestHand(['As', 'Ad', 'Ah', '9c', '9d']);
  assert.equal(hand.category, 'full-house');
});

test('evaluateBestHand identifies four of a kind', () => {
  const hand = evaluateBestHand(['As', 'Ad', 'Ah', 'Ac', '9d']);
  assert.equal(hand.category, 'four-of-a-kind');
});

test('evaluateBestHand identifies straight flush', () => {
  const hand = evaluateBestHand(['9s', '8s', '7s', '6s', '5s']);
  assert.equal(hand.category, 'straight-flush');
});

test('evaluateBestHand picks best 5 out of 7 cards', () => {
  const hand = evaluateBestHand(['As', 'Ad', 'Ah', 'Kc', 'Kd', '2s', '3h']);
  assert.equal(hand.category, 'full-house');
  assert.deepEqual(hand.tiebreaker, [14, 13]);
});

test('compareHandEvaluations ranks stronger hands higher', () => {
  const straight = evaluateBestHand(['As', 'Kd', 'Qh', 'Jc', 'Ts']);
  const trips = evaluateBestHand(['As', 'Ad', 'Ah', '9c', '3d']);
  assert.equal(compareHandEvaluations(straight, trips), 1);
});

test('compareHandEvaluations handles same category by kicker', () => {
  const pairAces = evaluateBestHand(['As', 'Ad', 'Kh', '7c', '3d']);
  const pairKings = evaluateBestHand(['Ks', 'Kd', 'Qh', '7c', '3d']);
  assert.equal(compareHandEvaluations(pairAces, pairKings), 1);
});

test('evaluateBestHand rejects invalid card counts', () => {
  assert.throws(() => evaluateBestHand(['As', 'Kd', 'Qh', 'Jc']), /requires 5 to 7 cards/);
  assert.throws(() => evaluateBestHand(['As', 'Kd', 'Qh', 'Jc', 'Ts', '9d', '8h', '7s']), /requires 5 to 7 cards/);
});

test('analyzeDraws identifies flush draw', () => {
  const result = analyzeDraws(['As', 'Ks'], ['2s', '7s', 'Qd']);
  assert.equal(result.draws.includes('flush-draw'), true);
});

test('analyzeDraws identifies open ended straight draw', () => {
  const result = analyzeDraws(['8c', '9d'], ['6s', '7h', 'Kd']);
  assert.equal(result.draws.includes('oesd'), true);
});

test('analyzeDraws identifies gutshot', () => {
  const result = analyzeDraws(['8c', 'Td'], ['6s', '7h', 'Kd']);
  assert.equal(result.draws.includes('gutshot'), true);
});

test('analyzeDraws identifies overcards on high-card boards', () => {
  const result = analyzeDraws(['As', 'Kd'], ['Qh', '7c', '3d']);
  assert.equal(result.overcards, 2);
  assert.equal(result.draws.includes('overcards'), true);
});

test('analyzeDraws identifies combo draw', () => {
  const result = analyzeDraws(['8s', '9s'], ['6s', '7s', 'Kd']);
  assert.equal(result.draws.includes('flush-draw'), true);
  assert.equal(result.draws.includes('oesd'), true);
  assert.equal(result.draws.includes('combo-draw'), true);
});

test('analyzeDraws reports made hand when already paired', () => {
  const result = analyzeDraws(['As', 'Kd'], ['Ac', '7c', '3d']);
  assert.equal(result.madeHand, 'one-pair');
  assert.equal(result.notes.some((note) => note.includes('当前已成')), true);
});

test('calculateEquityMonteCarlo returns normalized probabilities', () => {
  const result = calculateEquityMonteCarlo({
    heroCards: ['As', 'Ah'],
    boardCards: ['2c', '7d', '9h'],
    villainRange: [{ cards: [createCard('Ks'), createCard('Kh')] }],
    iterations: 2000,
    rngSeed: 42,
  });

  const sum = result.winRate + result.tieRate + result.loseRate;
  assert.equal(result.sampleCount, 2000);
  assert.equal(Math.abs(sum - 1) < 1e-9, true);
  assert.equal(result.equity >= 0 && result.equity <= 1, true);
});

test('calculateEquityMonteCarlo recognizes locked win on completed board', () => {
  const result = calculateEquityMonteCarlo({
    heroCards: ['As', 'Ah'],
    boardCards: ['Ac', 'Ad', '2h', '3d', '4s'],
    villainRange: [{ cards: [createCard('Ks'), createCard('Kh')] }],
    iterations: 500,
    rngSeed: 1,
  });

  assert.equal(result.winRate, 1);
  assert.equal(result.tieRate, 0);
  assert.equal(result.loseRate, 0);
});

test('calculateEquityMonteCarlo rejects empty villain range', () => {
  assert.throws(
    () =>
      calculateEquityMonteCarlo({
        heroCards: ['As', 'Ah'],
        boardCards: ['2c', '7d', '9h'],
        villainRange: [],
      }),
    /Villain range cannot be empty/,
  );
});

test('calculateEquityMonteCarlo rejects fully blocked villain range', () => {
  assert.throws(
    () =>
      calculateEquityMonteCarlo({
        heroCards: ['As', 'Ah'],
        boardCards: ['2c', '7d', '9h'],
        villainRange: [{ cards: [createCard('As'), createCard('Kh')] }],
      }),
    /fully blocked/,
  );
});

test('calculateFutureHandDistribution returns normalized distribution for flop', () => {
  const result = calculateFutureHandDistribution({
    heroCards: ['As', 'Kd'],
    boardCards: ['Qh', 'Js', '5d'],
    iterations: 2000,
    rngSeed: 99,
  });

  const sum = Object.values(result.distribution).reduce((acc, value) => acc + value, 0);
  assert.equal(result.sampleCount, 2000);
  assert.equal(Math.abs(sum - 1) < 1e-9, true);
});

test('calculateFutureHandDistribution becomes deterministic on river', () => {
  const result = calculateFutureHandDistribution({
    heroCards: ['As', 'Ah'],
    boardCards: ['Ac', 'Ad', '2h', '3d', '4s'],
    iterations: 2000,
    rngSeed: 11,
  });

  assert.equal(result.sampleCount, 1);
  assert.equal(result.distribution['four-of-a-kind'], 1);
  assert.equal(
    Object.entries(result.distribution)
      .filter(([_, value]) => value > 0)
      .length,
    1,
  );
});
