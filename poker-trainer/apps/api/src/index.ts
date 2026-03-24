import http from 'node:http';

import { analyzeDraws, calculateEquityMonteCarlo, createCard } from '@poker/poker-core';
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

function buildRecommendation(input: {
  boardCount: number;
  madeHand: string;
  draws: string[];
  equity: number;
}): AnalyzeResponse['recommendation'] {
  const reasons: string[] = [];
  let action: AnalyzeResponse['recommendation']['action'] = 'call';
  let confidence = 0.5;

  if (input.boardCount === 0) {
    action = input.equity >= 0.55 ? 'raise' : 'call';
    reasons.push('当前是翻前单对手近似评估，建议只做粗粒度训练使用');
  } else if (input.equity >= 0.7) {
    action = 'raise';
    confidence = 0.8;
    reasons.push('当前 equity 明显领先，适合偏主动继续');
  } else if (input.equity >= 0.45) {
    action = 'call';
    confidence = 0.65;
    reasons.push('当前 equity 尚可，适合继续观察后续街道');
  } else {
    action = 'fold';
    confidence = 0.7;
    reasons.push('当前 equity 偏低，继续投入需要更强额外条件');
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
}): AnalyzeResponse['explanation'] {
  const handLabel = toChineseHandLabel(input.madeHand);
  const drawLabels = input.draws.map(toChineseDrawLabel);
  const strengths: string[] = [];
  const risks: string[] = [];
  const focus: string[] = [];

  if (input.equity >= 0.65) {
    strengths.push('当前权益明显领先，具备较强继续价值');
  } else if (input.equity >= 0.45) {
    strengths.push('当前权益处于可继续区间，不算明显落后');
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

  if (input.draws.includes('combo-draw')) {
    focus.push('重点看转牌是否继续增强你的组合听牌或直接成牌');
  } else if (input.draws.includes('flush-draw') || input.draws.includes('oesd')) {
    focus.push('重点关注下一张牌是否让你获得更强成牌机会');
  } else if (input.madeHand !== 'high-card') {
    focus.push('重点判断当前已成牌是否足够承受后续压力');
  } else {
    focus.push('如果没有额外赔率或读牌优势，谨慎继续会更稳妥');
  }

  if (input.boardCount === 0) {
    focus.push('当前属于翻前近似训练，结果更适合用来校准起手牌感觉');
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

  return {
    headline,
    summary,
    strengths,
    risks,
    focus,
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

  const equity = calculateEquityMonteCarlo({
    heroCards,
    boardCards,
    villainRange: villainRange.combos,
    iterations: request.iterations ?? 5000,
    rngSeed: request.rngSeed ?? 1337,
  });

  const hand = analyzeDraws(heroCards, boardCards);
  const recommendation = buildRecommendation({
    boardCount: boardCards.length,
    madeHand: hand.madeHand,
    draws: hand.draws,
    equity: equity.equity,
  });
  const explanation = buildExplanation({
    equity: equity.equity,
    madeHand: hand.madeHand,
    draws: hand.draws,
    boardCount: boardCards.length,
    recommendation,
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
