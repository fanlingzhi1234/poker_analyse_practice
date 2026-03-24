export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export const SUITS = ['s', 'h', 'd', 'c'] as const satisfies readonly Suit[];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const satisfies readonly Rank[];

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type RecommendationAction = 'fold' | 'check' | 'call' | 'raise';

export interface Card {
  rank: Rank;
  suit: Suit;
  code: string;
  id: number;
}

export interface HeroHand {
  cards: [Card, Card];
}

export interface BoardState {
  flop?: [Card, Card, Card];
  turn?: Card;
  river?: Card;
}

export interface Combo {
  cards: [Card, Card];
  weight: number;
}

export interface RangeDefinition {
  source: 'preset' | 'text';
  raw: string;
  combos: Combo[];
}

export interface ScenarioInput {
  heroHand: [string, string];
  board: string[];
  playerCount: number;
  rangePreset: string;
  potSize?: number;
  callAmount?: number;
  street?: Street;
}

export interface EquityResult {
  winRate: number;
  tieRate: number;
  loseRate: number;
  mode: 'exact' | 'estimated';
  sampleCount?: number;
  ci95?: [number, number];
}

export interface HandSummary {
  category: string;
  draws: string[];
  notes: string[];
}

export interface Recommendation {
  action: RecommendationAction;
  confidence: number;
  reasons: string[];
}

export interface AnalysisResult {
  equity: EquityResult;
  hand: HandSummary;
  recommendation: Recommendation;
}
