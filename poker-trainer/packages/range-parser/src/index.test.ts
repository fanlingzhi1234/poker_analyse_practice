import test from 'node:test';
import assert from 'node:assert/strict';

import { getRangePreset, listRangePresets, parseRange } from './index.js';

test('parseRange parses a pair into 6 combos', () => {
  const combos = parseRange('AA');
  assert.equal(combos.length, 6);
});

test('parseRange parses suited hand into 4 combos', () => {
  const combos = parseRange('AKs');
  assert.equal(combos.length, 4);
});

test('parseRange parses offsuit hand into 12 combos', () => {
  const combos = parseRange('AKo');
  assert.equal(combos.length, 12);
});

test('parseRange parses pair plus syntax', () => {
  const combos = parseRange('TT+');
  assert.equal(combos.length, 30);
});

test('parseRange parses suited plus syntax', () => {
  const combos = parseRange('AJs+');
  assert.equal(combos.length, 12);
});

test('parseRange parses dash syntax', () => {
  const combos = parseRange('76s-54s');
  assert.equal(combos.length, 12);
});

test('parseRange supports comma separated expressions', () => {
  const combos = parseRange('AA,AKs,AKo');
  assert.equal(combos.length, 22);
});

test('parseRange deduplicates overlapping expressions', () => {
  const combos = parseRange('AA,AA,AKs,AKs');
  assert.equal(combos.length, 10);
});

test('parseRange supports ALL token through preset flow', () => {
  const preset = getRangePreset('any-two');
  assert.equal(preset.combos.length, 1326);
  assert.equal(preset.comboCount, 1326);
});

test('listRangePresets returns new v2 preset names', () => {
  const presetNames = listRangePresets().map((preset) => preset.name);
  assert.equal(presetNames.includes('broadway'), true);
  assert.equal(presetNames.includes('pocket-pairs'), true);
  assert.equal(presetNames.includes('suited-aces'), true);
  assert.equal(presetNames.includes('suited-connectors'), true);
});

test('getRangePreset returns metadata for user-facing display', () => {
  const preset = getRangePreset('broadway');
  assert.equal(preset.label, '百老汇牌');
  assert.equal(preset.category, '牌型认知类');
  assert.equal(preset.width, '中');
  assert.equal(preset.representativeHands.length > 0, true);
  assert.equal(preset.trainingHint.length > 0, true);
  assert.equal(preset.comboCount > 0, true);
});

test('getRangePreset returns non-empty speculative preset', () => {
  const preset = getRangePreset('speculative');
  assert.equal(preset.comboCount > 0, true);
  assert.equal(preset.label, '投机牌');
});

test('parseRange rejects invalid input', () => {
  assert.throws(() => parseRange(''), /Range text is empty/);
  assert.throws(() => parseRange('AXs'), /Invalid hand token|Invalid pair token/);
});
