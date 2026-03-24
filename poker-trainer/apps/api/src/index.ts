import http from 'node:http';

import { analyzeDraws, calculateEquityMonteCarlo, calculateFutureHandDistribution, createCard } from '@poker/poker-core';
import { getRangePreset, listRangePresets, parseRange } from '@poker/range-parser';

export interface AnalyzeRequest {
  heroHand: [string, string];
  board?: string[];
  rangePreset?: string;
  rangeText?: string;
  iterations?: number;
  rngSeed?: number;
  playerCount?: number;
}

export interface AnalyzeResponse {
  assumptions: {
    mode: 'single-opponent';
    playerCountReceived: number;
    playerCountApplied: number;
    rangeSource: 'preset' | 'text';
  };
  equity: {
    winRate: number;
    tieRate: number;
    loseRate: number;
    equity: number;
    sampleCount: number;
    mode: 'estimated';
  };
  hand: {
    madeHand: string;
    draws: string[];
    overcards: number;
    notes: string[];
  };
  futureHandDistribution: {
    distribution: Record<string, number>;
    sampleCount: number;
    mode: 'estimated';
  };
  recommendation: {
    action: 'fold' | 'check' | 'call' | 'raise';
    confidence: number;
    reasons: string[];
  };
  explanation: {
    headline: string;
    summary: string;
    strengths: string[];
    risks: string[];
    focus: string[];
    adjustments: {
      tighterRange: string;
      widerRange: string;
    };
  };
}

function toChineseHandLabel(value: string): string {
  const map: Record<string, string> = {
    'high-card': '高牌',
    'one-pair': '一对',
    'two-pair': '两对',
    'three-of-a-kind': '三条',
    straight: '顺子',
    flush: '同花',
    'full-house': '葫芦',
    'four-of-a-kind': '四条',
    'straight-flush': '同花顺',
  };
  return map[value] ?? value;
}

function toChineseDrawLabel(value: string): string {
  const map: Record<string, string> = {
    'flush-draw': '同花听牌',
    oesd: '两头顺听牌',
    gutshot: '卡顺听牌',
    overcards: '高张优势',
    'combo-draw': '组合听牌',
  };
  return map[value] ?? value;
}

type StreetBucket = 'preflop' | 'flop' | 'turn' | 'river';
type BoardTexture = 'dry' | 'semi-wet' | 'wet';
type RangeStrengthBucket = 'wide' | 'medium' | 'tight' | 'premium' | 'custom';
type PressureBucket = 'ahead' | 'marginal' | 'behind' | 'draw-dependent';

function getStreetBucket(boardCount: number): StreetBucket {
  if (boardCount === 0) return 'preflop';
  if (boardCount === 3) return 'flop';
  if (boardCount === 4) return 'turn';
  return 'river';
}

function getBoardTexture(board: Array<ReturnType<typeof createCard>>): BoardTexture {
  if (board.length < 3) return 'dry';

  const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const rankIndex = (rank: string) => rankOrder.indexOf(rank);
  const suitCounts = new Map<string, number>();
  const rankCounts = new Map<string, number>();
  const sortedRanks = [...new Set(board.map((card) => rankIndex(card.rank)))].sort((a, b) => a - b);

  for (const card of board) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
  }

  let score = 0;
  if (Math.max(...suitCounts.values()) >= 3) score += 2;
  else if (Math.max(...suitCounts.values()) === 2) score += 1;

  if (Array.from(rankCounts.values()).some((count) => count >= 2)) score += 1;

  const span = sortedRanks[sortedRanks.length - 1]! - sortedRanks[0]!;
  if (span <= 4) score += 2;
  else if (span <= 6) score += 1;

  const highCards = board.filter((card) => ['A', 'K', 'Q', 'J', 'T'].includes(card.rank)).length;
  if (highCards >= 2) score += 1;

  if (score >= 4) return 'wet';
  if (score >= 2) return 'semi-wet';
  return 'dry';
}

function getRangeStrengthBucket(request: AnalyzeRequest, rangeSource: 'preset' | 'text'): RangeStrengthBucket {
  if (rangeSource === 'text') return 'custom';

  const preset = request.rangePreset ?? 'standard';
  if (['any-two', 'loose', 'suited-hands'].includes(preset)) return 'wide';
  if (['standard', 'broadway', 'speculative', 'big-cards', 'suited-aces', 'suited-connectors', 'suited-one-gappers'].includes(preset)) return 'medium';
  if (['tight', 'value-heavy', 'pocket-pairs'].includes(preset)) return 'tight';
  return 'premium';
}

function getPressureBucket(input: {
  equity: number;
  madeHand: string;
  draws: string[];
  street: StreetBucket;
}): PressureBucket {
  if (input.equity >= 0.62 && input.madeHand !== 'high-card') return 'ahead';
  if (input.madeHand === 'high-card' && (input.draws.includes('combo-draw') || input.draws.includes('flush-draw') || input.draws.includes('oesd'))) return 'draw-dependent';
  if (input.equity < 0.4 && input.street !== 'preflop') return 'behind';
  return 'marginal';
}

function buildRecommendation(input: {
  boardCount: number;
  madeHand: string;
  draws: string[];
  equity: number;
  street: StreetBucket;
  boardTexture: BoardTexture;
  rangeStrength: RangeStrengthBucket;
  pressure: PressureBucket;
}): AnalyzeResponse['recommendation'] {
  const reasons: string[] = [];
  let action: AnalyzeResponse['recommendation']['action'] = 'call';
  let confidence = 0.5;

  if (input.street === 'preflop') {
    action = input.equity >= 0.55 ? 'raise' : 'call';
    reasons.push('当前是翻前单对手近似评估，建议只做粗粒度训练使用');
  } else if (input.pressure === 'ahead') {
    action = 'raise';
    confidence = 0.8;
    reasons.push('当前权益与成手强度都支持更主动地继续施压');
  } else if (input.pressure === 'draw-dependent') {
    action = input.equity >= 0.4 ? 'call' : 'fold';
    confidence = 0.62;
    reasons.push('当前更依赖听牌改良，适合按赔率与后续街道谨慎继续');
  } else if (input.pressure === 'marginal') {
    action = 'call';
    confidence = 0.64;
    reasons.push('当前属于边缘可继续区间，适合保留观察空间');
  } else {
    action = 'fold';
    confidence = 0.72;
    reasons.push('当前更像落后局面，继续投入需要非常充分的额外理由');
  }

  if (input.rangeStrength === 'premium' || input.rangeStrength === 'tight') {
    reasons.push('对手范围偏强，边缘牌继续时需要更保守');
    if (action === 'raise' && input.pressure !== 'ahead') action = 'call';
  } else if (input.rangeStrength === 'wide') {
    reasons.push('对手范围偏宽，你的高张和中等成手价值会更容易站住');
  }

  if (input.boardTexture === 'wet') {
    reasons.push('当前牌面偏湿，后续街道变化和反超空间都更大');
    if (input.pressure === 'marginal' && action === 'raise') action = 'call';
  } else if (input.boardTexture === 'dry') {
    reasons.push('当前牌面偏干，已成手和高张压制的价值更稳定');
  }

  if (input.draws.includes('combo-draw')) {
    action = input.equity >= 0.4 ? 'call' : action;
    reasons.push('存在组合听牌，后续改良空间较大');
  } else if (input.draws.includes('flush-draw') || input.draws.includes('oesd')) {
    reasons.push('存在较强听牌潜力，可提升继续游戏的合理性');
  } else if (input.draws.includes('gutshot')) {
    reasons.push('只有卡顺时，改良空间相对有限');
  }

  if (input.madeHand === 'high-card' && input.draws.length === 0) {
    reasons.push('当前未成手且缺乏明确听牌支撑');
  }

  return { action, confidence, reasons };
}

function buildExplanation(input: {
  equity: number;
  madeHand: string;
  draws: string[];
  boardCount: number;
  recommendation: AnalyzeResponse['recommendation'];
  street: StreetBucket;
  boardTexture: BoardTexture;
  rangeStrength: RangeStrengthBucket;
  pressure: PressureBucket;
}): AnalyzeResponse['explanation'] {
  const handLabel = toChineseHandLabel(input.madeHand);
  const drawLabels = input.draws.map(toChineseDrawLabel);
  const strengths: string[] = [];
  const risks: string[] = [];
  const focus: string[] = [];

  if (input.pressure === 'ahead') {
    strengths.push('当前权益和成手质量都处于较舒服的位置');
  } else if (input.pressure === 'marginal') {
    strengths.push('当前权益仍在可继续区间，但容错率不算特别高');
  } else if (input.pressure === 'draw-dependent') {
    strengths.push('当前主要价值来自听牌改良和后续街道实现率');
    risks.push('如果后续街道没有继续改善，当前权益会比较脆弱');
  } else {
    risks.push('当前权益偏低，继续投入需要更强理由');
  }

  if (input.madeHand !== 'high-card') {
    strengths.push(`当前已经形成${handLabel}，不属于纯空气牌`);
  } else {
    risks.push('当前还没成手，主要依赖后续街道改良');
  }

  if (drawLabels.length > 0) {
    strengths.push(`拥有${drawLabels.join('、')}，后续改良空间存在`);
  } else {
    risks.push('没有明显听牌支撑，容错率较低');
  }

  if (input.rangeStrength === 'premium' || input.rangeStrength === 'tight') {
    risks.push('对手范围偏强，你的边缘继续会更容易被压制');
  } else if (input.rangeStrength === 'wide') {
    strengths.push('对手范围偏宽时，你的高张和中等成手更容易兑现价值');
  }

  if (input.boardTexture === 'wet') {
    risks.push('当前牌面偏湿，后续街道反超和权益波动都更大');
  } else if (input.boardTexture === 'dry') {
    strengths.push('当前牌面偏干，已成手或高张压制的价值更稳定');
  }

  if (input.draws.includes('combo-draw')) {
    focus.push('重点看下一张牌是否继续增强你的组合听牌或直接成牌');
  } else if (input.draws.includes('flush-draw') || input.draws.includes('oesd')) {
    focus.push('重点关注下一张牌是否让你获得更强成牌机会');
  } else if (input.madeHand !== 'high-card') {
    focus.push('重点判断当前已成牌在当前街道是否足够承受后续压力');
  } else {
    focus.push('如果没有额外赔率或读牌优势，谨慎继续会更稳妥');
  }

  if (input.street === 'preflop') {
    focus.push('当前属于翻前近似训练，结果更适合用来校准起手牌感觉');
  } else if (input.street === 'turn') {
    focus.push('转牌已经接近最终兑现阶段，边缘听牌的继续门槛要更高一些');
  } else if (input.street === 'river') {
    focus.push('河牌已经没有后续改良空间，应更重视当前摊牌价值和范围压制关系');
  }

  const headline =
    input.recommendation.action === 'raise'
      ? '这手牌当前更适合主动施压'
      : input.recommendation.action === 'call'
        ? '这手牌当前更像一手可继续观察的牌'
        : input.recommendation.action === 'check'
          ? '这手牌当前更适合控制节奏'
          : '这手牌当前更偏向谨慎放弃';

  const summary =
    input.madeHand === 'high-card'
      ? `当前还是${handLabel}，${drawLabels.length ? `但带有${drawLabels.join('、')}。` : '而且缺少明确听牌。'}整体建议偏向 ${input.recommendation.action}。`
      : `当前已经形成${handLabel}。${drawLabels.length ? `同时还带有${drawLabels.join('、')}。` : ''}整体建议偏向 ${input.recommendation.action}。`;

  const tighterRange =
    input.rangeStrength === 'premium' || input.rangeStrength === 'tight'
      ? '当前对手本来就偏紧，若再收紧，应继续下调边缘继续频率，更重视摊牌价值。'
      : input.pressure === 'ahead'
        ? '如果对手范围收紧，你仍可能领先，但需要减少纯压制型激进行为。'
        : '如果对手范围收紧，这手牌通常会更接近谨慎继续甚至直接放弃。';

  const widerRange =
    input.rangeStrength === 'wide'
      ? '当前对手已经偏宽，再放宽时你对高张和中等成手的兑现空间会继续提升。'
      : input.pressure === 'draw-dependent'
        ? '如果对手范围更宽，你的听牌和高张继续会得到更好的实现环境。'
        : '如果对手范围更宽，你的当前手牌通常会比现在更容易获得继续理由。';

  return {
    headline,
    summary,
    strengths,
    risks,
    focus,
    adjustments: {
      tighterRange,
      widerRange,
    },
  };
}

function resolveVillainRange(request: AnalyzeRequest) {
  if (request.rangeText) {
    return {
      source: 'text' as const,
      combos: parseRange(request.rangeText),
    };
  }

  const presetName = request.rangePreset ?? 'standard';
  const preset = getRangePreset(presetName);
  return {
    source: 'preset' as const,
    combos: preset.combos,
  };
}

export function analyzeScenario(request: AnalyzeRequest): AnalyzeResponse {
  const heroHand = request.heroHand;
  const board = request.board ?? [];
  const playerCountReceived = request.playerCount ?? 2;

  if (!Array.isArray(heroHand) || heroHand.length !== 2) {
    throw new Error('heroHand must contain exactly 2 cards');
  }

  const heroCards = heroHand.map((code) => createCard(code)) as [ReturnType<typeof createCard>, ReturnType<typeof createCard>];
  const boardCards = board.map((code) => createCard(code));
  const villainRange = resolveVillainRange(request);

  const analysisIterations = request.iterations ?? 5000;
  const analysisSeed = request.rngSeed ?? 1337;

  const equity = calculateEquityMonteCarlo({
    heroCards,
    boardCards,
    villainRange: villainRange.combos,
    iterations: analysisIterations,
    rngSeed: analysisSeed,
  });

  const hand = analyzeDraws(heroCards, boardCards);
  const futureHandDistribution = calculateFutureHandDistribution({
    heroCards,
    boardCards,
    iterations: analysisIterations,
    rngSeed: analysisSeed,
  });
  const street = getStreetBucket(boardCards.length);
  const boardTexture = getBoardTexture(boardCards);
  const rangeStrength = getRangeStrengthBucket(request, villainRange.source);
  const pressure = getPressureBucket({
    equity: equity.equity,
    madeHand: hand.madeHand,
    draws: hand.draws,
    street,
  });

  const recommendation = buildRecommendation({
    boardCount: boardCards.length,
    madeHand: hand.madeHand,
    draws: hand.draws,
    equity: equity.equity,
    street,
    boardTexture,
    rangeStrength,
    pressure,
  });
  const explanation = buildExplanation({
    equity: equity.equity,
    madeHand: hand.madeHand,
    draws: hand.draws,
    boardCount: boardCards.length,
    recommendation,
    street,
    boardTexture,
    rangeStrength,
    pressure,
  });

  return {
    assumptions: {
      mode: 'single-opponent',
      playerCountReceived,
      playerCountApplied: 2,
      rangeSource: villainRange.source,
    },
    equity,
    hand,
    futureHandDistribution,
    recommendation,
    explanation,
  };
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    };

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { ...corsHeaders, 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/analyze') {
        const payload = (await readJsonBody(req)) as AnalyzeRequest;
        const result = analyzeScenario(payload);
        res.writeHead(200, { ...corsHeaders, 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'GET' && req.url === '/api/ranges/presets') {
        res.writeHead(200, { ...corsHeaders, 'content-type': 'application/json' });
        res.end(JSON.stringify({ presets: listRangePresets() }));
        return;
      }

      res.writeHead(404, { ...corsHeaders, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.writeHead(400, { ...corsHeaders, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  });
}

export function bootstrap(port = Number(process.env.PORT ?? 8787)) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`Poker Trainer API listening on http://localhost:${port}`);
  });
  return server;
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  bootstrap();
}
