import http from 'node:http';

import { analyzeDraws, calculateEquityMonteCarlo, createCard } from '@poker/poker-core';
import { getRangePreset, parseRange } from '@poker/range-parser';

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
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/analyze') {
        const payload = (await readJsonBody(req)) as AnalyzeRequest;
        const result = analyzeScenario(payload);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.writeHead(400, { 'content-type': 'application/json' });
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
