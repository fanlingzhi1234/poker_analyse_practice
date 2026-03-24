import { RANKS, SUITS, type Card, type Rank, type Suit } from '@poker/shared-types';

const RANK_TO_INDEX: Record<Rank, number> = Object.fromEntries(
  RANKS.map((rank, index) => [rank, index]),
) as Record<Rank, number>;

const SUIT_TO_INDEX: Record<Suit, number> = Object.fromEntries(
  SUITS.map((suit, index) => [suit, index]),
) as Record<Suit, number>;

const HAND_CATEGORY_NAMES = [
  'high-card',
  'one-pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
] as const;

export type HandCategory = (typeof HAND_CATEGORY_NAMES)[number];
export type DrawType = 'flush-draw' | 'oesd' | 'gutshot' | 'overcards' | 'combo-draw';

export interface HandEvaluation {
  category: HandCategory;
  categoryRank: number;
  tiebreaker: number[];
  bestFive: Card[];
  rankValue: string;
}

export interface DrawAnalysis {
  madeHand: HandCategory;
  draws: DrawType[];
  overcards: number;
  notes: string[];
}

export interface EquityAnalysisOptions {
  heroCards: Array<Card | string>;
  boardCards?: Array<Card | string>;
  villainRange: Array<{ cards: [Card, Card]; weight?: number }>;
  iterations?: number;
  rngSeed?: number;
}

export interface EquityAnalysisResult {
  winRate: number;
  tieRate: number;
  loseRate: number;
  equity: number;
  sampleCount: number;
  mode: 'estimated';
}

export function createCard(code: string): Card {
  const normalized = code.trim().toUpperCase();

  if (normalized.length !== 2) {
    throw new Error(`Invalid card code: ${code}`);
  }

  const rank = normalized[0] as Rank;
  const suit = normalized[1].toLowerCase() as Suit;

  if (!RANKS.includes(rank)) {
    throw new Error(`Invalid card rank: ${code}`);
  }

  if (!SUITS.includes(suit)) {
    throw new Error(`Invalid card suit: ${code}`);
  }

  const id = RANK_TO_INDEX[rank] * SUITS.length + SUIT_TO_INDEX[suit];

  return {
    rank,
    suit,
    code: `${rank}${suit}`,
    id,
  };
}

export function createDeck(): Card[] {
  return RANKS.flatMap((rank) => SUITS.map((suit) => createCard(`${rank}${suit}`)));
}

export function assertUniqueCards(cards: Array<Card | string>): void {
  const normalizedCodes = cards.map((card) => (typeof card === 'string' ? createCard(card).code : card.code));
  const seen = new Set<string>();

  for (const code of normalizedCodes) {
    if (seen.has(code)) {
      throw new Error(`Duplicate card detected: ${code}`);
    }
    seen.add(code);
  }
}

export function excludeCardsFromDeck(deck: Card[], excluded: Array<Card | string>): Card[] {
  const excludedCodes = new Set(excluded.map((card) => (typeof card === 'string' ? createCard(card).code : card.code)));
  return deck.filter((card) => !excludedCodes.has(card.code));
}

export function getRemainingDeck(excluded: Array<Card | string>): Card[] {
  assertUniqueCards(excluded);
  return excludeCardsFromDeck(createDeck(), excluded);
}

export function getStreetFromBoard(board: Array<Card | string>): 'preflop' | 'flop' | 'turn' | 'river' {
  const count = board.length;
  if (count === 0) return 'preflop';
  if (count === 3) return 'flop';
  if (count === 4) return 'turn';
  if (count === 5) return 'river';
  throw new Error(`Invalid board card count: ${count}`);
}

function toCards(cards: Array<Card | string>): Card[] {
  return cards.map((card) => (typeof card === 'string' ? createCard(card) : card));
}

function getRankValue(rank: Rank): number {
  return RANK_TO_INDEX[rank] + 2;
}

function sortDesc(values: number[]): number[] {
  return [...values].sort((a, b) => b - a);
}

function compareNumberArraysDesc(left: number[], right: number[]): number {
  const maxLength = Math.max(left.length, right.length);
  for (let i = 0; i < maxLength; i += 1) {
    const a = left[i] ?? -1;
    const b = right[i] ?? -1;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size > items.length || size <= 0) return [];
  if (size === items.length) return [items];
  if (size === 1) return items.map((item) => [item]);

  const result: T[][] = [];
  for (let i = 0; i <= items.length - size; i += 1) {
    const head = items[i]!;
    const tails = combinations(items.slice(i + 1), size - 1);
    for (const tail of tails) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

function findStraightHigh(values: number[]): number | null {
  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  if (unique.includes(14)) {
    unique.push(1);
  }

  let streak = 1;
  for (let i = 0; i < unique.length - 1; i += 1) {
    if (unique[i]! - 1 === unique[i + 1]!) {
      streak += 1;
      if (streak >= 5) {
        return unique[i - 3]!;
      }
    } else {
      streak = 1;
    }
  }

  return null;
}

function evaluateFiveCardHand(cards: Card[]): HandEvaluation {
  if (cards.length !== 5) {
    throw new Error(`Five-card evaluation requires exactly 5 cards, got ${cards.length}`);
  }

  const rankValues = cards.map((card) => getRankValue(card.rank));
  const sortedRanks = sortDesc(rankValues);
  const suitCounts = new Map<Suit, number>();
  const rankCounts = new Map<number, number>();

  for (const card of cards) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }

  for (const value of rankValues) {
    rankCounts.set(value, (rankCounts.get(value) ?? 0) + 1);
  }

  const isFlush = Array.from(suitCounts.values()).some((count) => count === 5);
  const straightHigh = findStraightHigh(rankValues);
  const isStraight = straightHigh !== null;

  const countEntries = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  let category: HandCategory;
  let categoryRank: number;
  let tiebreaker: number[];

  if (isStraight && isFlush) {
    category = 'straight-flush';
    categoryRank = 8;
    tiebreaker = [straightHigh!];
  } else if (countEntries[0]?.[1] === 4) {
    category = 'four-of-a-kind';
    categoryRank = 7;
    tiebreaker = [countEntries[0][0], countEntries[1][0]];
  } else if (countEntries[0]?.[1] === 3 && countEntries[1]?.[1] === 2) {
    category = 'full-house';
    categoryRank = 6;
    tiebreaker = [countEntries[0][0], countEntries[1][0]];
  } else if (isFlush) {
    category = 'flush';
    categoryRank = 5;
    tiebreaker = sortedRanks;
  } else if (isStraight) {
    category = 'straight';
    categoryRank = 4;
    tiebreaker = [straightHigh!];
  } else if (countEntries[0]?.[1] === 3) {
    category = 'three-of-a-kind';
    categoryRank = 3;
    tiebreaker = [countEntries[0][0], ...sortDesc(countEntries.slice(1).map(([value]) => value))];
  } else if (countEntries[0]?.[1] === 2 && countEntries[1]?.[1] === 2) {
    const pairValues = sortDesc([countEntries[0][0], countEntries[1][0]]);
    const kicker = countEntries[2]![0];
    category = 'two-pair';
    categoryRank = 2;
    tiebreaker = [...pairValues, kicker];
  } else if (countEntries[0]?.[1] === 2) {
    category = 'one-pair';
    categoryRank = 1;
    tiebreaker = [countEntries[0][0], ...sortDesc(countEntries.slice(1).map(([value]) => value))];
  } else {
    category = 'high-card';
    categoryRank = 0;
    tiebreaker = sortedRanks;
  }

  return {
    category,
    categoryRank,
    tiebreaker,
    bestFive: [...cards].sort((a, b) => b.id - a.id),
    rankValue: `${categoryRank}:${tiebreaker.join('-')}`,
  };
}

function countOvercards(hero: Card[], board: Card[]): number {
  if (board.length === 0) return 0;
  const highestBoardRank = Math.max(...board.map((card) => getRankValue(card.rank)));
  return hero.filter((card) => getRankValue(card.rank) > highestBoardRank).length;
}

function hasFlushDraw(hero: Card[], board: Card[]): boolean {
  if (board.length < 3 || board.length >= 5) return false;
  const suitCounts = new Map<Suit, number>();
  for (const card of [...hero, ...board]) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }
  return Array.from(suitCounts.values()).some((count) => count === 4);
}

function straightCompletionCount(values: number[]): number {
  const unique = new Set(values);
  if (unique.has(14)) unique.add(1);

  let completionCount = 0;
  for (let start = 1; start <= 10; start += 1) {
    const windowValues = [start, start + 1, start + 2, start + 3, start + 4];
    const present = windowValues.filter((value) => unique.has(value));
    if (present.length === 4) {
      completionCount += 1;
    }
  }
  return completionCount;
}

function detectStraightDraws(hero: Card[], board: Card[]): DrawType[] {
  if (board.length < 3 || board.length >= 5) return [];

  const values = [...hero, ...board].map((card) => getRankValue(card.rank));
  const completionCount = straightCompletionCount(values);

  if (completionCount >= 2) return ['oesd'];
  if (completionCount === 1) return ['gutshot'];
  return [];
}

export function compareHandEvaluations(left: HandEvaluation, right: HandEvaluation): number {
  if (left.categoryRank > right.categoryRank) return 1;
  if (left.categoryRank < right.categoryRank) return -1;
  return compareNumberArraysDesc(left.tiebreaker, right.tiebreaker);
}

export function evaluateBestHand(cards: Array<Card | string>): HandEvaluation {
  const normalizedCards = toCards(cards);
  assertUniqueCards(normalizedCards);

  if (normalizedCards.length < 5 || normalizedCards.length > 7) {
    throw new Error(`Best-hand evaluation requires 5 to 7 cards, got ${normalizedCards.length}`);
  }

  const allFiveCardCombos = combinations(normalizedCards, 5);
  let bestEvaluation: HandEvaluation | null = null;

  for (const combo of allFiveCardCombos) {
    const evaluation = evaluateFiveCardHand(combo);
    if (!bestEvaluation || compareHandEvaluations(evaluation, bestEvaluation) > 0) {
      bestEvaluation = evaluation;
    }
  }

  if (!bestEvaluation) {
    throw new Error('Failed to evaluate hand');
  }

  return bestEvaluation;
}

export function analyzeDraws(heroCards: Array<Card | string>, boardCards: Array<Card | string>): DrawAnalysis {
  const hero = toCards(heroCards);
  const board = toCards(boardCards);

  if (hero.length !== 2) {
    throw new Error(`Hero hand must contain exactly 2 cards, got ${hero.length}`);
  }

  if (![0, 3, 4, 5].includes(board.length)) {
    throw new Error(`Board must contain 0, 3, 4, or 5 cards, got ${board.length}`);
  }

  assertUniqueCards([...hero, ...board]);

  const evaluation = board.length >= 3 ? evaluateBestHand([...hero, ...board]) : null;
  const overcards = countOvercards(hero, board);
  const draws = new Set<DrawType>();
  const notes: string[] = [];

  if (hasFlushDraw(hero, board)) {
    draws.add('flush-draw');
  }

  for (const draw of detectStraightDraws(hero, board)) {
    draws.add(draw);
  }

  if (overcards === 2 && board.length >= 3 && (!evaluation || evaluation.category === 'high-card')) {
    draws.add('overcards');
  }

  if (draws.has('flush-draw') && (draws.has('oesd') || draws.has('gutshot'))) {
    draws.add('combo-draw');
  }

  const madeHand = evaluation?.category ?? 'high-card';

  if (madeHand === 'high-card') {
    notes.push('当前未成手');
  } else {
    notes.push(`当前已成 ${madeHand}`);
  }

  if (draws.has('flush-draw')) {
    notes.push('存在同花听牌潜力');
  }
  if (draws.has('oesd')) {
    notes.push('存在两头顺听牌');
  } else if (draws.has('gutshot')) {
    notes.push('存在卡顺听牌');
  }
  if (draws.has('overcards')) {
    notes.push('两张手牌都高于当前公共牌顶张');
  }
  if (draws.has('combo-draw')) {
    notes.push('属于组合听牌，后续改良空间较大');
  }

  return {
    madeHand,
    draws: Array.from(draws),
    overcards,
    notes,
  };
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickRandomIndex(length: number, rng: () => number): number {
  return Math.floor(rng() * length);
}

function normalizeVillainRange(
  villainRange: Array<{ cards: [Card, Card]; weight?: number }>,
  blockedCodes: Set<string>,
): Array<{ cards: [Card, Card]; weight: number }> {
  return villainRange
    .filter((combo) => !combo.cards.some((card) => blockedCodes.has(card.code)))
    .map((combo) => ({
      cards: combo.cards,
      weight: combo.weight ?? 1,
    }))
    .filter((combo) => combo.weight > 0);
}

function pickWeightedCombo<T extends { weight: number }>(items: T[], rng: () => number): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = rng() * totalWeight;

  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item;
    }
  }

  return items[items.length - 1]!;
}

export function calculateEquityMonteCarlo(options: EquityAnalysisOptions): EquityAnalysisResult {
  const hero = toCards(options.heroCards);
  const board = toCards(options.boardCards ?? []);

  if (hero.length !== 2) {
    throw new Error(`Hero hand must contain exactly 2 cards, got ${hero.length}`);
  }

  if (![0, 3, 4, 5].includes(board.length)) {
    throw new Error(`Board must contain 0, 3, 4, or 5 cards, got ${board.length}`);
  }

  assertUniqueCards([...hero, ...board]);

  if (options.villainRange.length === 0) {
    throw new Error('Villain range cannot be empty');
  }

  const iterations = options.iterations ?? 20000;
  const rng = createSeededRng(options.rngSeed ?? 1337);
  const blockedCodes = new Set([...hero, ...board].map((card) => card.code));
  const availableVillainRange = normalizeVillainRange(options.villainRange, blockedCodes);

  if (availableVillainRange.length === 0) {
    throw new Error('Villain range is fully blocked by hero hand / board');
  }

  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let i = 0; i < iterations; i += 1) {
    const villainCombo = pickWeightedCombo(availableVillainRange, rng);
    const usedCodes = new Set<string>([...blockedCodes, ...villainCombo.cards.map((card) => card.code)]);

    const remainingDeck = createDeck().filter((card) => !usedCodes.has(card.code));
    const boardCompletion = [...board];

    while (boardCompletion.length < 5) {
      const randomIndex = pickRandomIndex(remainingDeck.length, rng);
      const [picked] = remainingDeck.splice(randomIndex, 1);
      boardCompletion.push(picked!);
    }

    const heroEvaluation = evaluateBestHand([...hero, ...boardCompletion]);
    const villainEvaluation = evaluateBestHand([...villainCombo.cards, ...boardCompletion]);
    const comparison = compareHandEvaluations(heroEvaluation, villainEvaluation);

    if (comparison > 0) {
      wins += 1;
    } else if (comparison < 0) {
      losses += 1;
    } else {
      ties += 1;
    }
  }

  const sampleCount = wins + ties + losses;
  const winRate = wins / sampleCount;
  const tieRate = ties / sampleCount;
  const loseRate = losses / sampleCount;

  return {
    winRate,
    tieRate,
    loseRate,
    equity: winRate + tieRate / 2,
    sampleCount,
    mode: 'estimated',
  };
}

export function evaluateScenario() {
  return {
    status: 'todo',
    message: 'poker-core skeleton only',
  };
}
