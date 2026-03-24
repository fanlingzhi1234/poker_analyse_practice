import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeScenario } from './index.js';

test('analyzeScenario returns single-opponent assumptions and normalized equity', () => {
  const result = analyzeScenario({
    heroHand: ['As', 'Ah'],
    board: ['2c', '7d', '9h'],
    rangePreset: 'premium',
    iterations: 2000,
    rngSeed: 42,
    playerCount: 6,
  });

  assert.equal(result.assumptions.mode, 'single-opponent');
  assert.equal(result.assumptions.playerCountReceived, 6);
  assert.equal(result.assumptions.playerCountApplied, 2);
  assert.equal(result.assumptions.rangeSource, 'preset');

  const sum = result.equity.winRate + result.equity.tieRate + result.equity.loseRate;
  assert.equal(Math.abs(sum - 1) < 1e-9, true);
  assert.equal(result.equity.sampleCount, 2000);
  assert.equal(Array.isArray(result.hand.notes), true);
  assert.equal(Array.isArray(result.recommendation.reasons), true);
  assert.equal(typeof result.explanation.headline, 'string');
  assert.equal(Array.isArray(result.explanation.strengths), true);
  assert.equal(Array.isArray(result.explanation.risks), true);
  assert.equal(Array.isArray(result.explanation.focus), true);

  const distributionSum = Object.values(result.futureHandDistribution.distribution).reduce((acc, value) => acc + value, 0);
  assert.equal(Math.abs(distributionSum - 1) < 1e-9, true);
  assert.equal(result.futureHandDistribution.sampleCount, 2000);
});

test('analyzeScenario supports custom range text', () => {
  const result = analyzeScenario({
    heroHand: ['As', 'Kd'],
    board: ['Qh', 'Js', '5d'],
    rangeText: 'TT+,AJs+,KQo',
    iterations: 1000,
    rngSeed: 7,
  });

  assert.equal(result.assumptions.rangeSource, 'text');
  assert.equal(result.equity.sampleCount, 1000);
  assert.equal(result.futureHandDistribution.sampleCount, 1000);
});

test('analyzeScenario rejects invalid hero hand shape', () => {
  assert.throws(
    () =>
      analyzeScenario({
        heroHand: ['As'] as unknown as [string, string],
      }),
    /heroHand must contain exactly 2 cards/,
  );
});
