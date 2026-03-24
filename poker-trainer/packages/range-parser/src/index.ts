import type { Combo } from '@poker/shared-types';
import { createCard } from '@poker/poker-core';

const RANKS_ASC = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
type RankChar = (typeof RANKS_ASC)[number];
type HandSuitType = 'p' | 's' | 'o';

type RangeWidth = '超宽' | '宽' | '中' | '紧';

export interface HandClass {
  left: RankChar;
  right: RankChar;
  suitType: HandSuitType;
}

export interface RangePresetDefinition {
  name: string;
  label: string;
  description: string;
  width: RangeWidth;
  category: '宽度类' | '牌型认知类' | '风格导向类';
  representativeHands: string[];
  trainingHint: string;
  tokens: string[];
}

export interface RangePreset extends RangePresetDefinition {
  combos: Combo[];
  comboCount: number;
}

const SUITS = ['s', 'h', 'd', 'c'] as const;
const RANK_INDEX: Record<RankChar, number> = Object.fromEntries(RANKS_ASC.map((rank, index) => [rank, index])) as Record<RankChar, number>;

const RANGE_PRESET_DEFINITIONS: Record<string, RangePresetDefinition> = {
  'any-two': {
    name: 'any-two',
    label: '任意两张',
    description: '不对起手牌做任何限制，代表完全开放的两张牌范围。',
    width: '超宽',
    category: '宽度类',
    representativeHands: ['72o', 'J4o', 'A9s', 'KQo'],
    trainingHint: '适合在没有读牌信息时做最粗粒度的范围假设。',
    tokens: ['ALL'],
  },
  loose: {
    name: 'loose',
    label: '宽范围',
    description: '较宽的娱乐局入池范围，覆盖较多高张、同花牌和连张。',
    width: '宽',
    category: '宽度类',
    representativeHands: ['A8o', 'KTo', '87s', '54s'],
    trainingHint: '适合模拟偏松玩家，观察宽范围如何改变你的 equity。',
    tokens: ['22+', 'A2s+', 'K7s+', 'Q8s+', 'J8s+', 'T8s+', '97s+', '87s', '76s', '65s', '54s', 'A8o+', 'KTo+', 'QTo+', 'JTo'],
  },
  standard: {
    name: 'standard',
    label: '标准范围',
    description: '中等强度、较常见的正常入池范围，适合作为默认对手模型。',
    width: '中',
    category: '宽度类',
    representativeHands: ['55+', 'A7s+', 'KTs+', 'AQo+', 'KQo'],
    trainingHint: '适合在没有额外读牌时作为默认分析入口。',
    tokens: ['55+', 'A7s+', 'KTs+', 'QTs+', 'JTs', 'T9s', '98s', 'AQo+', 'AJo', 'KQo'],
  },
  tight: {
    name: 'tight',
    label: '紧范围',
    description: '偏向高张和中高对子，整体较保守。',
    width: '紧',
    category: '宽度类',
    representativeHands: ['77+', 'ATs+', 'AQo+', 'KQs'],
    trainingHint: '适合模拟谨慎玩家，观察当对手变紧时你的继续空间如何变化。',
    tokens: ['77+', 'ATs+', 'KQs', 'AQo+', 'AJo+', 'KQo'],
  },
  premium: {
    name: 'premium',
    label: '高强度范围',
    description: '主要由显著强牌组成，偏重价值和高摊牌强度。',
    width: '紧',
    category: '宽度类',
    representativeHands: ['TT+', 'AQs+', 'AKo', 'AKs'],
    trainingHint: '适合模拟强动作场景，帮助你理解对手高价值范围下的决策压力。',
    tokens: ['TT+', 'AQs+', 'AKo', 'AKs'],
  },
  'pocket-pairs': {
    name: 'pocket-pairs',
    label: '口袋对子',
    description: '两张起手牌点数相同，如 AA、99、22。',
    width: '中',
    category: '牌型认知类',
    representativeHands: ['AA', '99', '55', '22'],
    trainingHint: '适合观察翻牌后三条、超对和中对结构对胜率的影响。',
    tokens: ['22+'],
  },
  broadway: {
    name: 'broadway',
    label: '百老汇牌',
    description: '由 A/K/Q/J/T 组成的两张牌组合，属于高张密集范围。',
    width: '中',
    category: '牌型认知类',
    representativeHands: ['AK', 'KQ', 'QJ', 'JT'],
    trainingHint: '适合训练高张范围在翻牌后形成顶对、顺子和高 kicker 的能力。',
    tokens: ['AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'KTo', 'QJo', 'QTo', 'JTo'],
  },
  'suited-aces': {
    name: 'suited-aces',
    label: '同花A牌',
    description: '所有 Axs 结构，如 A2s 到 AKs。',
    width: '中',
    category: '牌型认知类',
    representativeHands: ['A2s', 'A5s', 'AJs', 'AKs'],
    trainingHint: '适合训练 A 高张与同花潜力同时存在时的改良路径。',
    tokens: ['A2s+'],
  },
  'suited-connectors': {
    name: 'suited-connectors',
    label: '同花连张',
    description: '连续点数且同花的起手牌，如 98s、87s、76s。',
    width: '中',
    category: '牌型认知类',
    representativeHands: ['98s', '87s', '76s', '65s', '54s'],
    trainingHint: '适合观察顺子、同花和组合听牌在翻后如何提升可玩性。',
    tokens: ['98s', '87s', '76s', '65s', '54s'],
  },
  'suited-one-gappers': {
    name: 'suited-one-gappers',
    label: '同花一张隔连张',
    description: '同花且中间差一张的结构，如 J9s、T8s、97s。',
    width: '中',
    category: '牌型认知类',
    representativeHands: ['J9s', 'T8s', '97s', '86s'],
    trainingHint: '适合观察比同花连张略弱、但仍有投机价值的翻后结构。',
    tokens: ['J9s', 'T8s', '97s', '86s', '75s', '64s'],
  },
  'big-cards': {
    name: 'big-cards',
    label: '大牌范围',
    description: '以 A/K/Q/J/T 组成的高张组合为主，偏向顶对和高 kicker。',
    width: '中',
    category: '牌型认知类',
    representativeHands: ['AK', 'AQ', 'KQ', 'QJ'],
    trainingHint: '适合模拟喜欢高张入池的玩家，观察顶对类牌面表现。',
    tokens: ['AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'AKo', 'AQo', 'AJo', 'KQo', 'KJo', 'QJo'],
  },
  'suited-hands': {
    name: 'suited-hands',
    label: '同花牌',
    description: '所有同花起手牌，强调同花和组合听牌潜力。',
    width: '宽',
    category: '牌型认知类',
    representativeHands: ['AKs', 'Q9s', '76s', '42s'],
    trainingHint: '适合训练“并未成手但具备同花潜力”的局面感。',
    tokens: ['A2s+', 'K2s+', 'Q2s+', 'J2s+', 'T2s+', '92s+', '82s+', '72s+', '62s+', '52s+', '42s+', '32s'],
  },
  'value-heavy': {
    name: 'value-heavy',
    label: '强价值牌',
    description: '以高对子、强 A 牌和强百老汇牌为主，偏向价值摊牌。',
    width: '紧',
    category: '风格导向类',
    representativeHands: ['QQ+', 'AK', 'AQs', 'KQs'],
    trainingHint: '适合模拟偏价值的强对手范围，理解被压制时的决策边界。',
    tokens: ['QQ+', 'AQs+', 'AKo', 'AKs', 'KQs'],
  },
  speculative: {
    name: 'speculative',
    label: '投机牌',
    description: '以中小对子、同花连张、同花 A 牌等依赖翻后改善的结构为主。',
    width: '中',
    category: '风格导向类',
    representativeHands: ['55', 'A5s', '87s', '64s'],
    trainingHint: '适合训练“当前不强，但后续改良空间大”的牌局理解。',
    tokens: ['99-22', 'A9s-A2s', '98s', '87s', '76s', '65s', '54s', 'J9s', 'T8s', '97s', '86s'],
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

export function getRangePreset(name: string): RangePreset {
  const preset = RANGE_PRESET_DEFINITIONS[name];
  if (!preset) {
    throw new Error(`Unknown range preset: ${name}`);
  }

  const combos = dedupeCombos(preset.tokens.flatMap((token) => parseRange(token)));
  return {
    ...preset,
    combos,
    comboCount: combos.length,
  };
}

export function listRangePresets(): RangePresetDefinition[] {
  return Object.values(RANGE_PRESET_DEFINITIONS);
}
