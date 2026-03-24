import type { Combo } from '@poker/shared-types';
import { createCard } from '@poker/poker-core';

const RANKS_ASC = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
type RankChar = (typeof RANKS_ASC)[number];
type HandSuitType = 'p' | 's' | 'o';

export interface HandClass {
  left: RankChar;
  right: RankChar;
  suitType: HandSuitType;
}

export interface RangePreset {
  name: string;
  description: string;
  tokens: string[];
}

const SUITS = ['s', 'h', 'd', 'c'] as const;
const RANK_INDEX: Record<RankChar, number> = Object.fromEntries(RANKS_ASC.map((rank, index) => [rank, index])) as Record<RankChar, number>;

const RANGE_PRESETS: Record<string, RangePreset> = {
  'any-two': {
    name: 'any-two',
    description: '任意两张起手牌',
    tokens: ['ALL'],
  },
  loose: {
    name: 'loose',
    description: '较宽的娱乐局/宽松入池范围',
    tokens: ['22+', 'A2s+', 'K7s+', 'Q8s+', 'J8s+', 'T8s+', '97s+', '87s', '76s', '65s', '54s', 'A8o+', 'KTo+', 'QTo+', 'JTo'],
  },
  standard: {
    name: 'standard',
    description: '中等强度的常见起手范围',
    tokens: ['55+', 'A7s+', 'KTs+', 'QTs+', 'JTs', 'T9s', '98s', 'AQo+', 'AJo', 'KQo'],
  },
  tight: {
    name: 'tight',
    description: '偏紧的稳健起手范围',
    tokens: ['77+', 'ATs+', 'KQs', 'AQo+', 'AJo+', 'KQo'],
  },
  premium: {
    name: 'premium',
    description: '高强度价值起手范围',
    tokens: ['TT+', 'AQs+', 'AKo', 'AKs'],
  },
};

function normalizeToken(token: string): string {
  return token.trim().replace(/\s+/g, '');
}

function isRankChar(value: string): value is RankChar {
  return RANKS_ASC.includes(value as RankChar);
}

function rankRangeInclusive(start: RankChar, end: RankChar): RankChar[] {
  const startIndex = RANK_INDEX[start];
  const endIndex = RANK_INDEX[end];
  if (startIndex > endIndex) {
    throw new Error(`Invalid rank range: ${start} to ${end}`);
  }
  return RANKS_ASC.slice(startIndex, endIndex + 1);
}

function canonicalPairToken(rank: RankChar): string {
  return `${rank}${rank}`;
}

function canonicalNonPairToken(left: RankChar, right: RankChar, suitType: 's' | 'o'): string {
  const ordered = RANK_INDEX[left] >= RANK_INDEX[right] ? [left, right] : [right, left];
  return `${ordered[0]}${ordered[1]}${suitType}`;
}

function expandPair(rank: RankChar): Combo[] {
  const combos: Combo[] = [];
  for (let i = 0; i < SUITS.length; i += 1) {
    for (let j = i + 1; j < SUITS.length; j += 1) {
      combos.push({
        cards: [createCard(`${rank}${SUITS[i]}`), createCard(`${rank}${SUITS[j]}`)],
        weight: 1,
      });
    }
  }
  return combos;
}

function expandSuited(left: RankChar, right: RankChar): Combo[] {
  return SUITS.map((suit) => ({
    cards: [createCard(`${left}${suit}`), createCard(`${right}${suit}`)],
    weight: 1,
  }));
}

function expandOffsuit(left: RankChar, right: RankChar): Combo[] {
  const combos: Combo[] = [];
  for (const leftSuit of SUITS) {
    for (const rightSuit of SUITS) {
      if (leftSuit === rightSuit) continue;
      combos.push({
        cards: [createCard(`${left}${leftSuit}`), createCard(`${right}${rightSuit}`)],
        weight: 1,
      });
    }
  }
  return combos;
}

function expandHandClass(handClass: HandClass): Combo[] {
  if (handClass.suitType === 'p') return expandPair(handClass.left);
  if (handClass.suitType === 's') return expandSuited(handClass.left, handClass.right);
  return expandOffsuit(handClass.left, handClass.right);
}

function parseBaseHand(token: string): HandClass {
  if (token.length === 2) {
    const [a, b] = token.split('');
    if (!isRankChar(a) || !isRankChar(b) || a !== b) {
      throw new Error(`Invalid pair token: ${token}`);
    }
    return { left: a, right: b, suitType: 'p' };
  }

  if (token.length === 3) {
    const [a, b, suitType] = token.split('');
    if (!isRankChar(a) || !isRankChar(b) || a === b) {
      throw new Error(`Invalid hand token: ${token}`);
    }
    if (suitType !== 's' && suitType !== 'o') {
      throw new Error(`Invalid suited token: ${token}`);
    }

    const ordered = RANK_INDEX[a] >= RANK_INDEX[b] ? [a, b] : [b, a];
    return { left: ordered[0], right: ordered[1], suitType };
  }

  throw new Error(`Unsupported token: ${token}`);
}

function expandPlusToken(token: string): string[] {
  const base = token.slice(0, -1);
  const parsed = parseBaseHand(base);

  if (parsed.suitType === 'p') {
    return rankRangeInclusive(parsed.left, 'A').map((rank) => canonicalPairToken(rank));
  }

  const results: string[] = [];
  for (let i = RANK_INDEX[parsed.right]; i < RANK_INDEX[parsed.left]; i += 1) {
    const right = RANKS_ASC[i]!;
    results.push(canonicalNonPairToken(parsed.left, right, parsed.suitType));
  }
  return results;
}

function expandDashToken(token: string): string[] {
  const [startToken, endToken] = token.split('-');
  if (!startToken || !endToken) {
    throw new Error(`Invalid range token: ${token}`);
  }

  const start = parseBaseHand(startToken);
  const end = parseBaseHand(endToken);

  if (start.suitType !== end.suitType) {
    throw new Error(`Range suit types must match: ${token}`);
  }

  if (start.suitType === 'p') {
    const ranks = rankRangeInclusive(end.left, start.left);
    return ranks.reverse().map((rank) => canonicalPairToken(rank));
  }

  const startGap = RANK_INDEX[start.left] - RANK_INDEX[start.right];
  const endGap = RANK_INDEX[end.left] - RANK_INDEX[end.right];

  if (start.left === end.left) {
    const low = Math.min(RANK_INDEX[start.right], RANK_INDEX[end.right]);
    const high = Math.max(RANK_INDEX[start.right], RANK_INDEX[end.right]);
    const result: string[] = [];
    for (let i = high; i >= low; i -= 1) {
      result.push(canonicalNonPairToken(start.left, RANKS_ASC[i]!, start.suitType));
    }
    return result;
  }

  if (startGap === endGap) {
    const leftHigh = Math.max(RANK_INDEX[start.left], RANK_INDEX[end.left]);
    const leftLow = Math.min(RANK_INDEX[start.left], RANK_INDEX[end.left]);
    const result: string[] = [];

    for (let leftIndex = leftHigh; leftIndex >= leftLow; leftIndex -= 1) {
      const rightIndex = leftIndex - startGap;
      if (rightIndex < 0) continue;
      result.push(canonicalNonPairToken(RANKS_ASC[leftIndex]!, RANKS_ASC[rightIndex]!, start.suitType));
    }

    return result;
  }

  throw new Error(`Unsupported dash range shape: ${token}`);
}

function expandTokenToHandClasses(token: string): string[] {
  if (token === 'ALL') {
    const all: string[] = [];
    for (let i = RANKS_ASC.length - 1; i >= 0; i -= 1) {
      const left = RANKS_ASC[i]!;
      all.push(canonicalPairToken(left));
      for (let j = i - 1; j >= 0; j -= 1) {
        const right = RANKS_ASC[j]!;
        all.push(canonicalNonPairToken(left, right, 's'));
        all.push(canonicalNonPairToken(left, right, 'o'));
      }
    }
    return all;
  }

  if (token.endsWith('+')) {
    return expandPlusToken(token);
  }

  if (token.includes('-')) {
    return expandDashToken(token);
  }

  const parsed = parseBaseHand(token);
  if (parsed.suitType === 'p') return [canonicalPairToken(parsed.left)];
  return [canonicalNonPairToken(parsed.left, parsed.right, parsed.suitType)];
}

function dedupeCombos(combos: Combo[]): Combo[] {
  const seen = new Set<string>();
  const result: Combo[] = [];

  for (const combo of combos) {
    const key = combo.cards.map((card) => card.code).sort().join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(combo);
  }

  return result;
}

export function parseRange(rangeText: string): Combo[] {
  const tokens = rangeText
    .split(',')
    .map(normalizeToken)
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Range text is empty');
  }

  const handClasses = tokens.flatMap(expandTokenToHandClasses);
  const combos = handClasses.flatMap((handClassToken) => expandHandClass(parseBaseHand(handClassToken)));
  return dedupeCombos(combos);
}

export function getRangePreset(name: string): RangePreset & { combos: Combo[] } {
  const preset = RANGE_PRESETS[name];
  if (!preset) {
    throw new Error(`Unknown range preset: ${name}`);
  }

  const combos = dedupeCombos(preset.tokens.flatMap((token) => parseRange(token)));
  return {
    ...preset,
    combos,
  };
}

export function listRangePresets(): RangePreset[] {
  return Object.values(RANGE_PRESETS);
}
